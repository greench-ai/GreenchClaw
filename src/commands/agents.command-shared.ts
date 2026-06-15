import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import type { RuntimeEnv } from "../runtime.js";
import {
  requireValidConfigFileSnapshot as requireValidConfigFileSnapshotBase,
  requireValidConfigSnapshot,
} from "./config-validation.js";

export function createQuietRuntime(runtime: RuntimeEnv): RuntimeEnv {
  return { ...runtime, log: () => {} };
}

export async function requireValidConfigFileSnapshot(runtime: RuntimeEnv) {
  return await requireValidConfigFileSnapshotBase(runtime);
}

export async function requireValidConfig(runtime: RuntimeEnv): Promise<GreenchClawConfig | null> {
  return await requireValidConfigSnapshot(runtime);
}
