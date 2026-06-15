#!/usr/bin/env node
// Configures git to use the repo-bundled git-hooks/ directory.
//
// Replaces the previous `prepare` lifecycle script (which only ran on
// `npm install` / `pnpm install` via a shell one-liner). Running this
// script is now an explicit, opt-in step:
//
//   pnpm run setup:hooks
//
// Idempotent: rerunning is a no-op when core.hooksPath is already set to
// the repo's git-hooks/ directory. Safe to invoke outside a git checkout
// (exits 0 with a notice).

import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const HOOKS_DIR = join(REPO_ROOT, "git-hooks");
const EXPECTED_HOOKS_PATH = relative(REPO_ROOT, HOOKS_DIR) || "git-hooks";

function hasGit() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isInsideWorkTree() {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out === "true";
  } catch {
    return false;
  }
}

function readCurrentHooksPath() {
  try {
    const out = execFileSync("git", ["config", "--get", "core.hooksPath"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out;
  } catch {
    return null;
  }
}

function setHooksPath(hooksPath) {
  execFileSync("git", ["config", "core.hooksPath", hooksPath], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

export function isDirectSetupHooksInvocation(params = {}) {
  const entryPath = params.entryPath ?? process.argv[1];
  if (!entryPath) return false;
  const modulePath = params.modulePath ?? fileURLToPath(import.meta.url);
  return resolve(entryPath) === resolve(modulePath);
}

export function runSetupHooks({
  cwd = REPO_ROOT,
  hooksDir = HOOKS_DIR,
  hasGitFn = hasGit,
  isInsideWorkTreeFn = isInsideWorkTree,
  readCurrentHooksPathFn = readCurrentHooksPath,
  setHooksPathFn = setHooksPath,
  log = console,
} = {}) {
  if (!hasGitFn()) {
    log.log?.("[setup-hooks] git not found on PATH; skipping");
    return { configured: false, reason: "no-git" };
  }
  if (!isInsideWorkTreeFn()) {
    log.log?.(`[setup-hooks] ${cwd} is not inside a git work tree; skipping`);
    return { configured: false, reason: "not-in-work-tree" };
  }
  const current = readCurrentHooksPathFn();
  if (current === EXPECTED_HOOKS_PATH) {
    log.log?.(
      `[setup-hooks] core.hooksPath already points at ${EXPECTED_HOOKS_PATH}; nothing to do`,
    );
    return { configured: true, alreadySet: true };
  }
  setHooksPathFn(EXPECTED_HOOKS_PATH);
  log.log?.(
    `[setup-hooks] configured core.hooksPath=${EXPECTED_HOOKS_PATH} (was: ${current ?? "unset"})`,
  );
  return { configured: true, alreadySet: false, previous: current ?? null };
}

if (isDirectSetupHooksInvocation()) {
  runSetupHooks();
}
