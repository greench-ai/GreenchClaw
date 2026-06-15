import {
  applyAgentDefaultModelPrimary,
  type GreenchClawConfig,
} from "GreenchClaw/plugin-sdk/provider-onboard";

export const OPENCODE_GO_DEFAULT_MODEL_REF = "opencode-go/kimi-k2.6";

export function applyOpencodeGoProviderConfig(cfg: GreenchClawConfig): GreenchClawConfig {
  return cfg;
}

export function applyOpencodeGoConfig(cfg: GreenchClawConfig): GreenchClawConfig {
  return applyAgentDefaultModelPrimary(
    applyOpencodeGoProviderConfig(cfg),
    OPENCODE_GO_DEFAULT_MODEL_REF,
  );
}
