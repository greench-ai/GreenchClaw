import type { ChannelDoctorConfigMutation } from "GreenchClaw/plugin-sdk/channel-contract";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import { normalizeCompatibilityConfig as normalizeCompatibilityConfigImpl } from "./doctor.js";

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: GreenchClawConfig;
}): ChannelDoctorConfigMutation {
  return normalizeCompatibilityConfigImpl({ cfg });
}
