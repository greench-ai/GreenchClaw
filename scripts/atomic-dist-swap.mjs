#!/usr/bin/env node
/**
 * Atomic dist/ swap — build into a versioned release, verify, then flip a
 * symlink. The live `dist/` tree is never mutated in place, so a running
 * gateway / isolated cron turn importing `GreenchClaw/plugin-sdk/*` (which
 * resolves through package.json's self-reference into `dist/`) never sees a
 * missing or half-written module tree.
 *
 * Layout (under the repo root):
 *   releases/<UTC-ts>/dist/            full build output
 *   releases/<UTC-ts>/dist-runtime/    runtime overlay
 *   releases/<UTC-ts>/RELEASE.json     { ts, commit, node, entries }
 *   dist            -> releases/<ts>/dist            (symlink, live)
 *   dist-runtime    -> releases/<ts>/dist-runtime    (symlink, live)
 *
 * Flow:
 *   1. Refuse to run while the live `dist` is a real directory (one-time
 *      migration: the caller opts in with --migrate).
 *   2. Build into releases/<ts> by re-pointing the working symlinks, running
 *      the stock `scripts/build-all.mjs` (cwd untouched, so every stage writes
 *      "through" the symlink into the new release), then verifying.
 *   3. Fail-closed: on any error restore the previous symlinks and exit non-zero.
 *   4. On success, atomically rename the new symlink over the live one.
 *   5. Prune old releases, keeping the last N (default 3).
 *
 * Usage:
 *   node scripts/atomic-dist-swap.mjs [--keep=3] [--skip-build] [--rollback]
 *     --skip-build   re-verify the existing live release (no build)
 *     --rollback     re-point to the previous release and exit
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIVE_ROOTS = ["dist", "dist-runtime"];
const RELEASES_DIR = "releases";
const DEFAULT_KEEP = 3;
const RELEASE_META = "RELEASE.json";
const MANAGED_MARKER = ".GreenchClaw-managed-dist";
const BUILD_LOCK = ".GreenchClaw-build.lock";

/** True when the repo has adopted the managed-release layout. */
export function isManagedLayout(rootDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  return fsImpl.existsSync(path.join(rootDir, MANAGED_MARKER));
}

/**
 * Guard for the stock build path: if the repo is in managed layout but a live
 * root is a real directory (a plain build silently reverted the symlink), fail
 * loudly instead of producing a tree the next release swap throws away.
 * Returns null when the tree is OK to build.
 */
export function checkManagedLayoutIntact(rootDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  if (!isManagedLayout(rootDir, { fs: fsImpl })) {
    return null;
  }
  for (const root of LIVE_ROOTS) {
    const linkPath = path.join(rootDir, root);
    if (!fsImpl.existsSync(linkPath)) {
      continue;
    }
    if (!fsImpl.lstatSync(linkPath).isSymbolicLink()) {
      return (
        `${root}/ is a real directory but this repo uses the managed-release layout. ` +
        `Use \`node scripts/atomic-dist-swap.mjs\` (or \`pnpm build:release\`) instead of a plain build.`
      );
    }
  }
  return null;
}

/** Acquire an exclusive build lock (mkdir-based, portable). Returns a release fn. */
export function acquireBuildLock(rootDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  const lockPath = path.join(rootDir, BUILD_LOCK);
  try {
    fsImpl.mkdirSync(lockPath);
  } catch (error) {
    if (error && error.code === "EEXIST") {
      throw new Error(
        `another build is in progress (${lockPath} exists). If that is stale, remove it and retry.`,
        { cause: error },
      );
    }
    throw error;
  }
  return () => {
    try {
      fsImpl.rmSync(lockPath, { force: true, recursive: true });
    } catch {
      // best-effort
    }
  };
}

function writeManagedMarker(fsImpl, rootDir) {
  const markerPath = path.join(rootDir, MANAGED_MARKER);
  if (fsImpl.existsSync(markerPath)) {
    return;
  }
  fsImpl.writeFileSync(
    markerPath,
    "# This repo builds via scripts/atomic-dist-swap.mjs (managed-release layout).\n" +
      "# dist/ and dist-runtime/ are symlinks into releases/<ts>/. Do not run a plain\n" +
      "# `node scripts/build-all.mjs` here; use `pnpm build:release`. Delete this file\n" +
      "# to opt out of the managed layout.\n",
  );
}

/** Files that must resolve + load from a release before it may go live. */
const REQUIRED_ENTRY_SMOKE = [
  "dist/index.js",
  "dist/plugin-sdk/channel-targets.js",
  "dist/plugin-sdk/plugin-entry.js",
];

export function parseArgs(argv) {
  const opts = { keep: DEFAULT_KEEP, skipBuild: false, rollback: false };
  for (const arg of argv) {
    if (arg === "--skip-build") {
      opts.skipBuild = true;
    } else if (arg === "--rollback") {
      opts.rollback = true;
    } else if (arg.startsWith("--keep=")) {
      const parsed = Number.parseInt(arg.slice("--keep=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        opts.keep = parsed;
      }
    }
  }
  return opts;
}

export function timestampTag(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function readGitCommit(cwd) {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return result.status === 0 && typeof result.stdout === "string"
      ? result.stdout.trim()
      : "unknown";
  } catch {
    return "unknown";
  }
}

/** Create a relative symlink at linkPath -> targetPath, replacing any existing link. */
function replaceSymlink(fsImpl, linkPath, targetPath) {
  const tmpLink = `${linkPath}.new-${process.pid}`;
  try {
    fsImpl.rmSync(tmpLink, { force: true, recursive: true });
  } catch {
    // best-effort
  }
  fsImpl.symlinkSync(targetPath, tmpLink);
  fsImpl.renameSync(tmpLink, linkPath);
}

/** Re-point the live roots at a release's dist dirs (atomic rename per root). */
export function pointLiveRootsAtRelease(rootDir, releaseDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  const results = [];
  for (const root of LIVE_ROOTS) {
    const linkPath = path.join(rootDir, root);
    const targetRel = path.relative(rootDir, path.join(releaseDir, root));
    if (fsImpl.existsSync(linkPath) && !fsImpl.lstatSync(linkPath).isSymbolicLink()) {
      throw new Error(
        `refusing to replace ${root}: it is a real directory, not a managed symlink ` +
          `(run with --migrate once to convert)`,
      );
    }
    replaceSymlink(fsImpl, linkPath, targetRel);
    results.push({ root, targetRel });
  }
  return results;
}

/** Return the release dir the live symlinks currently resolve to, or null. */
export function currentReleaseDir(rootDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  const linkPath = path.join(rootDir, "dist");
  let stat;
  try {
    stat = fsImpl.lstatSync(linkPath);
  } catch {
    return null;
  }
  if (!stat.isSymbolicLink()) {
    return null;
  }
  const target = fsImpl.readlinkSync(linkPath);
  return path.dirname(path.resolve(rootDir, target));
}

/** List release dirs newest-first. */
export function listReleases(rootDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  const base = path.join(rootDir, RELEASES_DIR);
  let entries = [];
  try {
    entries = fsImpl.readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .toSorted((a, b) => b.localeCompare(a));
}

/** Delete all but the newest `keep` releases. Never deletes the live release. */
export function pruneReleases(rootDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  const keep = params.keep ?? DEFAULT_KEEP;
  const live = params.liveDir ?? currentReleaseDir(rootDir, { fs: fsImpl });
  const all = listReleases(rootDir, { fs: fsImpl });
  const survivors = all.slice(0, keep);
  if (live && !survivors.includes(live)) {
    survivors.push(live);
  }
  const removed = [];
  for (const dir of all) {
    if (survivors.includes(dir)) {
      continue;
    }
    try {
      fsImpl.rmSync(dir, { force: true, recursive: true });
      removed.push(dir);
    } catch {
      // best-effort
    }
  }
  return removed;
}

/** Import-smoke every required entry from a release dir. Throws on failure. */
export async function verifyRelease(rootDir, releaseDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  const importer = params.importFn ?? ((url) => import(url));
  const missing = [];
  for (const rel of REQUIRED_ENTRY_SMOKE) {
    const abs = path.join(releaseDir, rel);
    if (!fsImpl.existsSync(abs)) {
      missing.push(rel);
    }
  }
  if (missing.length > 0) {
    throw new Error(`release verification failed; missing entries: ${missing.join(", ")}`);
  }
  for (const rel of REQUIRED_ENTRY_SMOKE) {
    const abs = path.join(releaseDir, rel);
    try {
      await importer(pathToFileURL(abs).href);
    } catch (error) {
      throw new Error(`release verification failed importing ${rel}: ${String(error)}`, {
        cause: error,
      });
    }
  }
}

function writeReleaseMeta(fsImpl, rootDir, releaseDir) {
  const meta = {
    ts: path.basename(releaseDir),
    commit: readGitCommit(rootDir),
    node: process.version,
    entries: REQUIRED_ENTRY_SMOKE,
  };
  fsImpl.writeFileSync(
    path.join(releaseDir, RELEASE_META),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
  return meta;
}

/**
 * Full build+release. Returns { releaseDir, stagingRoot }.
 *
 * The build runs from a STAGING ROOT: a scratch dir that symlinks every
 * top-level repo entry back to the real repo, except `dist`/`dist-runtime`
 * which point at the new release. That way every stock build script (which
 * resolves paths against cwd) writes into the new release while the LIVE
 * `dist` symlink is never touched — so running processes keep importing a
 * complete tree for the entire build. Throws on failure; the live symlink is
 * never modified until the new release has verified.
 */
export async function buildRelease(rootDir, opts = {}, params = {}) {
  const fsImpl = params.fs ?? fs;
  const runBuild = params.runBuild ?? defaultRunBuild;
  const verify = params.verify ?? verifyRelease;
  const previousDir = currentReleaseDir(rootDir, { fs: fsImpl });

  const releaseDir = path.join(rootDir, RELEASES_DIR, timestampTag());
  for (const root of LIVE_ROOTS) {
    fsImpl.mkdirSync(path.join(releaseDir, root), { recursive: true });
  }

  const stagingRoot = path.join(rootDir, RELEASES_DIR, `.staging-${path.basename(releaseDir)}`);
  try {
    createStagingRoot(fsImpl, rootDir, stagingRoot, releaseDir);
    await runBuild(stagingRoot);
    // The build owns staging/dist + staging/dist-runtime (the clean step wipes
    // them). Move them into the release now that the build succeeded.
    adoptStagingOutputs(fsImpl, stagingRoot, releaseDir);
    await verify(rootDir, releaseDir, { fs: fsImpl });
    writeReleaseMeta(fsImpl, rootDir, releaseDir);
    // Success: atomically point the live symlinks at the verified release.
    pointLiveRootsAtRelease(rootDir, releaseDir, { fs: fsImpl });
    pruneReleases(rootDir, {
      fs: fsImpl,
      keep: opts.keep ?? DEFAULT_KEEP,
      liveDir: releaseDir,
    });
    return { releaseDir, previousDir, stagingRoot };
  } catch (error) {
    // Fail-closed: the live symlink was never moved, but clean up the failed
    // release + staging root so it cannot be mistaken for a good build.
    try {
      fsImpl.rmSync(releaseDir, { force: true, recursive: true });
    } catch {
      // best-effort
    }
    throw error;
  } finally {
    try {
      fsImpl.rmSync(stagingRoot, { force: true, recursive: true });
    } catch {
      // best-effort
    }
  }
}

/**
 * Build a scratch root that mirrors the repo by symlink, with dist/dist-runtime
 * as real (empty) directories. The stock build's `cleanTsdownOutputRoots()`
 * `rm -rf`s those roots, so they cannot be symlinks here — they must be real
 * dirs that the build owns. After a successful build the caller moves them
 * into the release dir.
 */
function createStagingRoot(fsImpl, rootDir, stagingRoot, _releaseDir) {
  fsImpl.rmSync(stagingRoot, { force: true, recursive: true });
  fsImpl.mkdirSync(stagingRoot, { recursive: true });
  const redirected = new Set([
    ...LIVE_ROOTS,
    RELEASES_DIR,
    "node_modules",
    MANAGED_MARKER,
    BUILD_LOCK,
  ]);
  for (const entry of fsImpl.readdirSync(rootDir)) {
    if (redirected.has(entry)) {
      continue;
    }
    fsImpl.symlinkSync(path.join(rootDir, entry), path.join(stagingRoot, entry));
  }
  for (const root of LIVE_ROOTS) {
    fsImpl.mkdirSync(path.join(stagingRoot, root), { recursive: true });
  }
  // node_modules must be a REAL tree here, never a symlink: pnpm follows a
  // symlinked node_modules and purges/reinstalls THROUGH the link, destroying
  // the real install. A hardlink clone (same filesystem, ~0.5s) gives pnpm a
  // real tree that shares blobs with the original — cheap and safe.
  cloneNodeModules(fsImpl, path.join(rootDir, "node_modules"), path.join(stagingRoot, "node_modules"));
  return stagingRoot;
}

/** Hardlink-clone node_modules into the staging root (same-filesystem only). */
function cloneNodeModules(fsImpl, from, to) {
  if (!fsImpl.existsSync(from)) {
    return;
  }
  const result = spawnSync("cp", ["-al", from, to], { stdio: ["ignore", "ignore", "pipe"] });
  if (result.status === 0) {
    return;
  }
  // Cross-device or partial: fall back to a real recursive copy without
  // following symlinks into the pnpm store.
  fsImpl.cpSync(from, to, { recursive: true, dereference: false });
}

/** Move the freshly built dist/ + dist-runtime from staging into the release. */
function adoptStagingOutputs(fsImpl, stagingRoot, releaseDir) {
  for (const root of LIVE_ROOTS) {
    const from = path.join(stagingRoot, root);
    if (!fsImpl.existsSync(from)) {
      continue;
    }
    const to = path.join(releaseDir, root);
    fsImpl.rmSync(to, { force: true, recursive: true });
    fsImpl.renameSync(from, to);
  }
}

/** Re-point the live symlinks at the newest release that is not the live one. */
export function rollback(rootDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  const live = currentReleaseDir(rootDir, { fs: fsImpl });
  const candidates = listReleases(rootDir, { fs: fsImpl });
  const target = candidates.find((dir) => dir !== live);
  if (!target) {
    throw new Error("rollback: no previous release available");
  }
  pointLiveRootsAtRelease(rootDir, target, { fs: fsImpl });
  return target;
}

function defaultRunBuild(cwd) {
  const result = spawnSync(process.execPath, [path.join(cwd, "scripts", "build-all.mjs")], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (typeof result.status !== "number" || result.status !== 0) {
    throw new Error(`build-all failed with status ${result.status ?? "unknown"}`);
  }
}

/** One-time migration: convert real dist/ dirs into managed symlinks of a release. */
export function migrateToManagedLayout(rootDir, params = {}) {
  const fsImpl = params.fs ?? fs;
  const liveDist = path.join(rootDir, "dist");
  if (!fsImpl.existsSync(liveDist) || fsImpl.lstatSync(liveDist).isSymbolicLink()) {
    return null; // already managed
  }
  const releaseDir = path.join(rootDir, RELEASES_DIR, `migrated-${timestampTag()}`);
  fsImpl.mkdirSync(releaseDir, { recursive: true });
  for (const root of LIVE_ROOTS) {
    const src = path.join(rootDir, root);
    if (!fsImpl.existsSync(src)) {
      fsImpl.mkdirSync(path.join(releaseDir, root), { recursive: true });
      continue;
    }
    fsImpl.renameSync(src, path.join(releaseDir, root));
  }
  pointLiveRootsAtRelease(rootDir, releaseDir, { fs: fsImpl });
  return releaseDir;
}

function isMainModule() {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return import.meta.url === pathToFileURL(argv1).href;
  }
}

if (isMainModule()) {
  const rootDir = process.cwd();
  const opts = parseArgs(process.argv.slice(2));
  try {
    if (process.argv.includes("--migrate")) {
      const migrated = migrateToManagedLayout(rootDir);
      console.error(
        migrated ? `[atomic-dist-swap] migrated live tree to ${migrated}` : "[atomic-dist-swap] already managed",
      );
      process.exit(0);
    }

    if (opts.rollback) {
      const target = rollback(rootDir);
      console.error(`[atomic-dist-swap] rolled back to ${target}`);
      process.exit(0);
    }

    if (opts.skipBuild) {
      const live = currentReleaseDir(rootDir);
      if (!live) {
        throw new Error("no live release found (run a build first)");
      }
      await verifyRelease(rootDir, live);
      console.error(`[atomic-dist-swap] verified live release ${live}`);
      process.exit(0);
    }

    const releaseLock = acquireBuildLock(rootDir);
    try {
      const { releaseDir, previousDir } = await buildRelease(rootDir, opts);
      writeManagedMarker(fs, rootDir);
      console.error(`[atomic-dist-swap] live release -> ${releaseDir}`);
      if (previousDir) {
        console.error(`[atomic-dist-swap] rollback target: ${previousDir}`);
      }
    } finally {
      releaseLock();
    }
    process.exit(0);
  } catch (error) {
    console.error(`[atomic-dist-swap] FAILED: ${String(error)}`);
    process.exit(1);
  }
}
