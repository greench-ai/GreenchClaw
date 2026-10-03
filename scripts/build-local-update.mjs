#!/usr/bin/env node
/**
 * Local host update — build a new release atomically, then restart the local
 * gateway so it picks it up. This is the flow you want on a long-lived host
 * where a gateway is *running* while you rebuild: a plain `pnpm build`
 * rm -rf's dist/ and strands the live process for the whole build.
 *
 * Steps:
 *   1. `atomic-dist-swap.mjs`  — build into releases/<ts>/, verify, flip the
 *      dist/ + dist-runtime/ symlinks. Fail-closed: a broken build never goes
 *      live.
 *   2. Restart the local gateway (systemd user unit by default) so it
 *      re-resolves through the new symlink.
 *   3. Report the live release + rollback target.
 *
 * Flags:
 *   --no-restart   build+swap only, leave the running gateway alone
 *   --rollback     re-point to the previous release, then restart
 *   --verify-only  verify the current live release, no build, no restart
 *   --service=NAME override the systemd unit (default GreenchClaw-gateway)
 *   --keep=N       releases to retain (passed through)
 *
 * Env:
 *   GREENCHCLAW_UPDATE_SERVICE   default unit name
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SWAP = path.join(HERE, "atomic-dist-swap.mjs");
const DEFAULT_SERVICE = process.env.GREENCHCLAW_UPDATE_SERVICE || "GreenchClaw-gateway";

function run(command, args, label) {
  console.error(`[update] ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (typeof result.status !== "number" || result.status !== 0) {
    throw new Error(`${label} failed (status ${result.status ?? "unknown"})`);
  }
}

function restartGateway(service) {
  // systemctl --user restart <unit>; fall back to the gateway CLI if unavailable.
  const systemctl = spawnSync(
    "systemctl",
    ["--user", "restart", service],
    { stdio: "inherit", env: process.env },
  );
  if (systemctl.status === 0) {
    return;
  }
  console.error("[update] systemctl restart failed; falling back to `GreenchClaw gateway restart`");
  run("GreenchClaw", ["gateway", "restart"], "gateway restart");
}

function main(argv) {
  const noRestart = argv.includes("--no-restart");
  const rollback = argv.includes("--rollback");
  const verifyOnly = argv.includes("--verify-only");
  const serviceArg = argv.find((a) => a.startsWith("--service="));
  const service = serviceArg ? serviceArg.slice("--service=".length) : DEFAULT_SERVICE;
  const keepArg = argv.find((a) => a.startsWith("--keep="));

  const swapArgs = [];
  if (rollback) {
    swapArgs.push("--rollback");
  } else if (verifyOnly) {
    swapArgs.push("--skip-build");
  }
  if (keepArg) {
    swapArgs.push(keepArg);
  }

  run(process.execPath, [SWAP, ...swapArgs], "atomic-dist-swap");

  if (verifyOnly || noRestart) {
    console.error(
      `[update] ${verifyOnly ? "verified" : "built"} — gateway restart skipped` +
        (noRestart ? " (--no-restart)" : ""),
    );
    return;
  }

  restartGateway(service);
  console.error(`[update] gateway restarted (${service}) — now serving the new release`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`[update] FAILED: ${String(error)}`);
  process.exit(1);
}
