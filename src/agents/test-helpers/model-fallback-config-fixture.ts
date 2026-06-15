import type { GreenchClawConfig } from "../../config/types.GreenchClaw.js";

export function makeModelFallbackCfg(
  overrides: Partial<GreenchClawConfig> = {},
): GreenchClawConfig {
  return {
    agents: {
      defaults: {
        model: {
          primary: "openai/gpt-4.1-mini",
          fallbacks: ["anthropic/claude-haiku-3-5"],
        },
      },
    },
    ...overrides,
  } as GreenchClawConfig;
}
