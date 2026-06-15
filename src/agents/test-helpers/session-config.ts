import type { GreenchClawConfig } from "../../config/types.GreenchClaw.js";

export function createPerSenderSessionConfig(
  overrides: Partial<NonNullable<GreenchClawConfig["session"]>> = {},
): NonNullable<GreenchClawConfig["session"]> {
  return {
    mainKey: "main",
    scope: "per-sender",
    ...overrides,
  };
}
