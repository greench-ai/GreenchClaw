import type { ChannelLegacyStateMigrationPlan } from "GreenchClaw/plugin-sdk/channel-contract";
import { resolveChannelAllowFromPath } from "GreenchClaw/plugin-sdk/channel-pairing-paths";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import { statRegularFileSync } from "GreenchClaw/plugin-sdk/security-runtime";
import { resolveDefaultTelegramAccountId } from "./account-selection.js";

function fileExists(pathValue: string): boolean {
  try {
    return !statRegularFileSync(pathValue).missing;
  } catch {
    return false;
  }
}

export function detectTelegramLegacyStateMigrations(params: {
  cfg: GreenchClawConfig;
  env: NodeJS.ProcessEnv;
}): ChannelLegacyStateMigrationPlan[] {
  const legacyPath = resolveChannelAllowFromPath("telegram", params.env);
  if (!fileExists(legacyPath)) {
    return [];
  }
  const accountId = resolveDefaultTelegramAccountId(params.cfg);
  const targetPath = resolveChannelAllowFromPath("telegram", params.env, accountId);
  if (fileExists(targetPath)) {
    return [];
  }
  return [
    {
      kind: "copy",
      label: "Telegram pairing allowFrom",
      sourcePath: legacyPath,
      targetPath,
    },
  ];
}
