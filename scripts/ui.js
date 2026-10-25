#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCmdExeCommandLine } from "./windows-cmd-helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const uiDir = path.join(repoRoot, "ui");

const WINDOWS_CMD_EXE_EXTENSIONS = new Set([".cmd", ".bat"]);

function usage() {
  // keep this tiny; it's invoked from npm scripts too
  process.stderr.write("Usage: node scripts/ui.js <install|dev|build|test> [...args]\n");
}

function which(cmd) {
  try {
    const key = process.platform === "win32" ? "Path" : "PATH";
    const paths = (process.env[key] ?? process.env.PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean);
    const extensions =
      process.platform === "win32"
        ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
        : [""];
    for (const entry of paths) {
      for (const ext of extensions) {
        const candidate = path.join(entry, process.platform === "win32" ? `${cmd}${ext}` : cmd);
        try {
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveRunner() {
  const pnpm = which("pnpm");
  if (pnpm) {
    return { cmd: pnpm, kind: "pnpm" };
  }
  return null;
}

export function shouldUseCmdExeForCommand(cmd, platform = process.platform) {
  if (platform !== "win32") {
    return false;
  }
  const extension = path.extname(cmd).toLowerCase();
  return WINDOWS_CMD_EXE_EXTENSIONS.has(extension);
}

export function resolveSpawnCall(cmd, args, envOverride, params = {}) {
  const platform = params.platform ?? process.platform;
  const comSpec = params.comSpec ?? process.env.ComSpec ?? "cmd.exe";
  const options = {
    cwd: params.cwd ?? uiDir,
    stdio: "inherit",
    env: envOverride ?? process.env,
    shell: false,
  };

  if (shouldUseCmdExeForCommand(cmd, platform)) {
    return {
      command: comSpec,
      args: ["/d", "/s", "/c", buildCmdExeCommandLine(cmd, args)],
      options: {
        ...options,
        windowsVerbatimArguments: true,
      },
    };
  }

  return {
    command: cmd,
    args,
    options,
  };
}

function run(cmd, args) {
  const { command, args: spawnArgs, options } = resolveSpawnCall(cmd, args);
  let child;
  try {
    child = spawn(command, spawnArgs, options);
  } catch (err) {
    console.error(`Failed to launch ${cmd}:`, err);
    process.exit(1);
    return;
  }

  child.on("error", (err) => {
    console.error(`Failed to launch ${cmd}:`, err);
    process.exit(1);
  });
  child.on("exit", (code) => {
    if (code !== 0) {
      process.exit(code ?? 1);
    }
  });
}

function runSync(cmd, args, envOverride) {
  const { command, args: spawnArgs, options } = resolveSpawnCall(cmd, args, envOverride);
  let result;
  try {
    result = spawnSync(command, spawnArgs, options);
  } catch (err) {
    console.error(`Failed to launch ${cmd}:`, err);
    process.exit(1);
    return;
  }
  if (result.signal) {
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function depsInstalled(kind) {
  try {
    const require = createRequire(path.join(uiDir, "package.json"));
    require.resolve("vite");
    require.resolve("dompurify");
    if (kind === "test") {
      require.resolve("vitest");
      require.resolve("@vitest/browser-playwright");
      require.resolve("playwright");
    }
    return true;
  } catch {
    return false;
  }
}

function resolveScriptAction(action) {
  if (action === "install") {
    return null;
  }
  if (action === "dev") {
    return "dev";
  }
  if (action === "build") {
    return "build";
  }
  if (action === "test") {
    return "test";
  }
  return null;
}

/**
 * Stamp the built service worker with a per-build id.
 *
 * `ui/public/sw.js` declares CACHE_NAME using a placeholder token. Vite copies it
 * verbatim into the output, so we have to replace it after the build. Without a
 * distinct id per build, the browser keeps serving its precached index.html while
 * the gateway sends a newer CSP, and the stale inline scripts get blocked — the
 * "Executing inline script violates the following Content Security Policy" loop.
 *
 * The id is derived from the hashed asset filenames in the fresh build, so it
 * changes exactly when the emitted bundle changes.
 */
/**
 * Stamp the built service worker with a per-build id.
 *
 * `ui/public/sw.js` declares CACHE_NAME using a placeholder token. Vite copies it
 * verbatim into the output, so we have to replace it after the build. Without a
 * distinct id per build, the browser keeps serving its precached index.html while
 * the gateway sends a newer CSP, and the stale inline scripts get blocked — the
 * "Executing inline script violates the following Content Security Policy" loop.
 *
 * The id is derived from the hashed asset filenames in the fresh build, so it
 * changes exactly when the emitted bundle changes.
 *
 * Public/ assets (including sw.js) are copied by Vite's copy step, which can land
 * slightly after the build process exits, so retry briefly rather than assuming
 * the file is already there. Without this, an `npm run ui:build` that races the
 * copy silently leaves the placeholder in place and reintroduces the stale-cache
 * bug this stamp exists to prevent.
 */
function stampServiceWorkerBuildId(outDir, opts = {}) {
  const retries = opts.retries ?? 40;
  const waitMs = opts.waitMs ?? 50;
  const swPath = path.join(outDir, "sw.js");
  const placeholder = "self.__GREENCHCLAW_BUILD_ID__";

  const deadline = Date.now() + retries * waitMs;
  let source = null;
  while (Date.now() <= deadline) {
    if (fs.existsSync(swPath)) {
      const candidate = fs.readFileSync(swPath, "utf8");
      if (candidate.includes(placeholder)) {
        source = candidate;
        break;
      }
    }
    // Busy-wait in small slices: this runs once at the end of a build, and the
    // copy step is measured in milliseconds.
    spawnSync(process.execPath, ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${waitMs})`]);
  }

  if (!source) {
    // Distinguish "sw.js never arrived" from "already stamped" so a genuine
    // regression is visible instead of looking like a no-op.
    if (fs.existsSync(swPath)) {
      return null;
    }
    process.stderr.write(
      `[ui:build] WARNING: ${swPath} not found after ${retries * waitMs}ms — ` +
        "service worker left unstamped (browsers may serve stale HTML).\n",
    );
    return null;
  }

  const assetsDir = path.join(outDir, "assets");
  // Wait for the asset directory to be populated too: sw.js and assets/ are both
  // emitted by the build's copy/write phase, and stamping before assets exist
  // produces the hash of an empty string (e3b0c442…), which is a constant and
  // therefore defeats the whole point of a per-build cache key.
  let assetNames = [];
  const assetsDeadline = Date.now() + retries * waitMs;
  while (Date.now() <= assetsDeadline) {
    try {
      assetNames = fs.readdirSync(assetsDir).toSorted();
    } catch {
      assetNames = [];
    }
    if (assetNames.length > 0) {
      break;
    }
    spawnSync(process.execPath, ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${waitMs})`]);
  }
  if (assetNames.length === 0) {
    process.stderr.write(
      `[ui:build] WARNING: no assets found in ${assetsDir} — service worker cache id ` +
        "would be constant; leaving the placeholder unstamped.\n",
    );
    return null;
  }
  const buildId = createHash("sha256")
    .update(assetNames.join("\n"), "utf8")
    .digest("hex")
    .slice(0, 12);
  fs.writeFileSync(swPath, source.split(placeholder).join(JSON.stringify(buildId)), "utf8");
  return buildId;
}

export function main(argv = process.argv.slice(2)) {
  const [action, ...rest] = argv;
  if (!action) {
    usage();
    process.exit(2);
  }

  const runner = resolveRunner();
  if (!runner) {
    process.stderr.write("Missing UI runner: install pnpm, then retry.\n");
    process.exit(1);
  }

  const script = resolveScriptAction(action);
  if (action !== "install" && !script) {
    usage();
    process.exit(2);
  }

  if (action === "install") {
    run(runner.cmd, ["install", ...rest]);
    return;
  }

  if (!depsInstalled(action === "test" ? "test" : "build")) {
    const installEnv = process.env;
    const installArgs = ["install"];
    runSync(runner.cmd, installArgs, installEnv);
  }

  run(runner.cmd, ["run", script, ...rest]);

  if (action === "build") {
    const outDir = path.join(uiDir, "..", "dist", "control-ui");
    const buildId = stampServiceWorkerBuildId(outDir);
    if (buildId) {
      process.stdout.write(`[ui:build] service worker cache id: ${buildId}\n`);
    }
  }
}

const isDirectExecution = (() => {
  const entry = process.argv[1];
  return Boolean(entry && path.resolve(entry) === fileURLToPath(import.meta.url));
})();

if (isDirectExecution) {
  main();
}
