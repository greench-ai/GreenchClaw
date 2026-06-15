import { createNonExitingRuntime, type RuntimeEnv } from "GreenchClaw/plugin-sdk/runtime-env";
import { normalizeStringEntries } from "GreenchClaw/plugin-sdk/string-coerce-runtime";
import type { MonitorIMessageOpts } from "./types.js";

export function resolveRuntime(opts: MonitorIMessageOpts): RuntimeEnv {
  return opts.runtime ?? createNonExitingRuntime();
}

export function normalizeAllowList(list?: Array<string | number>) {
  return normalizeStringEntries(list);
}
