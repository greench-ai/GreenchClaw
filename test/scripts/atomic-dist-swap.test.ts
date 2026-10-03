import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  acquireBuildLock,
  buildRelease,
  checkManagedLayoutIntact,
  currentReleaseDir,
  isManagedLayout,
  listReleases,
  migrateToManagedLayout,
  parseArgs,
  pointLiveRootsAtRelease,
  pruneReleases,
  rollback,
  timestampTag,
  verifyRelease,
} from "../../scripts/atomic-dist-swap.mjs";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDir } = createScriptTestHarness();

function seedRelease(rootDir, name, marker) {
  const releaseDir = path.join(rootDir, "releases", name);
  for (const root of ["dist", "dist-runtime"]) {
    fs.mkdirSync(path.join(releaseDir, root, "plugin-sdk"), { recursive: true });
  }
  fs.writeFileSync(path.join(releaseDir, "dist", "index.js"), `// ${marker}\n`);
  fs.writeFileSync(
    path.join(releaseDir, "dist", "plugin-sdk", "channel-targets.js"),
    `// ${marker}\n`,
  );
  fs.writeFileSync(
    path.join(releaseDir, "dist", "plugin-sdk", "plugin-entry.js"),
    `// ${marker}\n`,
  );
  return releaseDir;
}

describe("atomic-dist-swap", () => {
  it("parses flags with sane defaults", () => {
    expect(parseArgs([])).toEqual({ keep: 3, skipBuild: false, rollback: false });
    expect(parseArgs(["--keep=5", "--skip-build"])).toEqual({
      keep: 5,
      skipBuild: true,
      rollback: false,
    });
    expect(parseArgs(["--rollback"])).toEqual({ keep: 3, skipBuild: false, rollback: true });
  });

  it("tags releases with a filesystem-safe UTC timestamp", () => {
    const tag = timestampTag(new Date("2026-10-03T11:55:00.123Z"));
    expect(tag).toBe("2026-10-03T11-55-00-123Z");
    expect(tag).not.toMatch(/[:.]/u);
  });

  it("refuses to replace a real dist/ directory (must be a managed symlink)", () => {
    const rootDir = createTempDir("GreenchClaw-swap-real-");
    fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "releases", "r1", "dist"), { recursive: true });
    expect(() =>
      pointLiveRootsAtRelease(rootDir, path.join(rootDir, "releases", "r1")),
    ).toThrow(/real directory/u);
  });

  it("migrates a real dist/ tree into a release and points the live symlink at it", () => {
    const rootDir = createTempDir("GreenchClaw-swap-migrate-");
    fs.mkdirSync(path.join(rootDir, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "dist", "plugin-sdk", "x.js"), "live\n");
    fs.mkdirSync(path.join(rootDir, "dist-runtime"), { recursive: true });

    const releaseDir = migrateToManagedLayout(rootDir);
    expect(releaseDir).toBeTruthy();
    expect(fs.lstatSync(path.join(rootDir, "dist")).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(rootDir, "dist", "plugin-sdk", "x.js"), "utf8")).toBe(
      "live\n",
    );
    // Idempotent: a second call is a no-op.
    expect(migrateToManagedLayout(rootDir)).toBeNull();
  });

  it("verifies a release and throws listing missing entries", async () => {
    const rootDir = createTempDir("GreenchClaw-swap-verify-");
    const releaseDir = path.join(rootDir, "releases", "r1");
    fs.mkdirSync(releaseDir, { recursive: true });
    // Only one of the three required entries exists.
    fs.mkdirSync(path.join(releaseDir, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(releaseDir, "dist", "index.js"), "export {};\n");
    fs.writeFileSync(path.join(releaseDir, "dist", "plugin-sdk", "plugin-entry.js"), "export {};\n");

    await expect(verifyRelease(rootDir, releaseDir)).rejects.toThrow(/channel-targets\.js/u);
  });

  it("fails closed: a broken build never moves the live symlink and drops the failed release", async () => {
    const rootDir = createTempDir("GreenchClaw-swap-failclosed-");
    const previous = seedRelease(rootDir, "2026-01-01T00-00-00-000Z", "previous");
    pointLiveRootsAtRelease(rootDir, previous);
    expect(currentReleaseDir(rootDir)).toBe(previous);

    let stagingRootSeen = null;
    const runBuild = vi.fn(async (stagingRoot) => {
      stagingRootSeen = stagingRoot;
      const live = currentReleaseDir(rootDir);
      fs.mkdirSync(path.join(stagingRoot, "dist", "plugin-sdk"), { recursive: true });
      fs.writeFileSync(path.join(stagingRoot, "dist", "index.js"), "export {};\n");
      // Deliberately leave channel-targets.js + plugin-entry.js missing so verify fails.
      // The live symlink must still point at the good previous release here.
      expect(live).toBe(previous);
    });

    await expect(buildRelease(rootDir, {}, { runBuild })).rejects.toThrow(/verification failed/u);

    // Live still points at the good previous release; the failed build never
    // touched it.
    expect(currentReleaseDir(rootDir)).toBe(previous);
    expect(fs.readFileSync(path.join(rootDir, "dist", "index.js"), "utf8")).toContain("previous");
    // The failed release dir + staging root were cleaned up.
    expect(fs.existsSync(stagingRootSeen)).toBe(false);
    expect(listReleases(rootDir)).toEqual([previous]);
  });

  it("swaps to the new release on success and keeps the previous for rollback", async () => {
    const rootDir = createTempDir("GreenchClaw-swap-success-");
    const previous = seedRelease(rootDir, "2026-01-01T00-00-00-000Z", "previous");
    pointLiveRootsAtRelease(rootDir, previous);

    const runBuild = vi.fn(async (stagingRoot) => {
      fs.mkdirSync(path.join(stagingRoot, "dist", "plugin-sdk"), { recursive: true });
      fs.writeFileSync(path.join(stagingRoot, "dist", "index.js"), "// next\n");
      fs.writeFileSync(path.join(stagingRoot, "dist", "plugin-sdk", "channel-targets.js"), "// next\n");
      fs.writeFileSync(path.join(stagingRoot, "dist", "plugin-sdk", "plugin-entry.js"), "// next\n");
    });

    const { releaseDir, previousDir, stagingRoot } = await buildRelease(rootDir, {}, { runBuild });
    expect(previousDir).toBe(previous);
    expect(currentReleaseDir(rootDir)).toBe(releaseDir);
    expect(fs.readFileSync(path.join(rootDir, "dist", "index.js"), "utf8")).toContain("next");
    expect(fs.existsSync(path.join(releaseDir, "RELEASE.json"))).toBe(true);
    // Staging root cleaned up.
    expect(fs.existsSync(stagingRoot)).toBe(false);
  });

  it("rolls back to the previous release", async () => {
    const rootDir = createTempDir("GreenchClaw-swap-rollback-");
    const previous = seedRelease(rootDir, "2026-01-01T00-00-00-000Z", "previous");
    const current = seedRelease(rootDir, "2026-02-02T00-00-00-000Z", "current");
    pointLiveRootsAtRelease(rootDir, current);
    expect(currentReleaseDir(rootDir)).toBe(current);

    const target = rollback(rootDir);
    expect(target).toBe(previous);
    expect(currentReleaseDir(rootDir)).toBe(previous);
  });

  it("prunes old releases but never the live one", () => {
    const rootDir = createTempDir("GreenchClaw-swap-prune-");
    const r1 = seedRelease(rootDir, "2026-01-01T00-00-00-000Z", "1");
    const r2 = seedRelease(rootDir, "2026-02-02T00-00-00-000Z", "2");
    const r3 = seedRelease(rootDir, "2026-03-03T00-00-00-000Z", "3");
    const r4 = seedRelease(rootDir, "2026-04-04T00-00-00-000Z", "4");
    pointLiveRootsAtRelease(rootDir, r4);

    const removed = pruneReleases(rootDir, { keep: 2, liveDir: r4 });

    // Keep the newest 2 plus the live one; r1/r2 are dropped.
    expect(removed).toContain(r1);
    expect(removed).toContain(r2);
    expect(fs.existsSync(r3)).toBe(true);
    expect(fs.existsSync(r4)).toBe(true);
  });

  it("does not follow the live symlink when reading a release", async () => {
    const rootDir = createTempDir("GreenchClaw-swap-resolve-");
    const rel = seedRelease(rootDir, "2026-05-05T00-00-00-000Z", "live");
    pointLiveRootsAtRelease(rootDir, rel);
    expect(currentReleaseDir(rootDir)).toBe(rel);
    const stat = await fsPromises.lstat(path.join(rootDir, "dist"));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("guards a managed repo against a plain build that reverted the symlink", () => {
    const rootDir = createTempDir("GreenchClaw-swap-guard-");
    // Unmanaged: no marker -> guard is silent.
    expect(checkManagedLayoutIntact(rootDir)).toBeNull();
    expect(isManagedLayout(rootDir)).toBe(false);

    fs.writeFileSync(path.join(rootDir, ".GreenchClaw-managed-dist"), "# managed\n");
    expect(isManagedLayout(rootDir)).toBe(true);

    // Managed + symlink -> OK.
    const rel = seedRelease(rootDir, "2026-06-06T00-00-00-000Z", "ok");
    pointLiveRootsAtRelease(rootDir, rel);
    expect(checkManagedLayoutIntact(rootDir)).toBeNull();

    // Managed + real directory (bypass) -> loud failure.
    fs.rmSync(path.join(rootDir, "dist"));
    fs.mkdirSync(path.join(rootDir, "dist"));
    expect(checkManagedLayoutIntact(rootDir)).toMatch(/real directory/u);
  });

  it("takes an exclusive build lock and rejects a concurrent build", () => {
    const rootDir = createTempDir("GreenchClaw-swap-lock-");
    const release = acquireBuildLock(rootDir);
    expect(() => acquireBuildLock(rootDir)).toThrow(/in progress/u);
    release();
    // Lock released -> a new build can start.
    const release2 = acquireBuildLock(rootDir);
    release2();
  });
});
