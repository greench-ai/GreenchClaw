import { normalizeProviderId } from "../agents/model-selection.js";
import { resolveProviderAuthAliasMap } from "../agents/provider-auth-aliases.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import { resolveManifestProviderAuthChoices } from "../plugins/provider-auth-choices.js";

function normalizeProviderIdForAuth(
  providerId: string,
  aliases: Readonly<Record<string, string>>,
): string {
  const normalized = normalizeProviderId(providerId);
  return normalized ? (aliases[normalized] ?? normalized) : normalized;
}

function matchesProviderAuthChoice(
  choice: { providerId: string },
  providerId: string,
  aliases: Readonly<Record<string, string>>,
): boolean {
  const normalized = normalizeProviderIdForAuth(providerId, aliases);
  if (!normalized) {
    return false;
  }
  return normalizeProviderIdForAuth(choice.providerId, aliases) === normalized;
}

function resolveProviderAuthLoginCommand(params: {
  provider: string;
  config?: GreenchClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): string | undefined {
  const aliases = resolveProviderAuthAliasMap(params);
  const choice = resolveManifestProviderAuthChoices(params).find((candidate) =>
    matchesProviderAuthChoice(candidate, params.provider, aliases),
  );
  if (!choice) {
    return undefined;
  }
  return formatCliCommand(`GreenchClaw models auth login --provider ${choice.providerId}`);
}

export function buildProviderAuthRecoveryHint(params: {
  provider: string;
  config?: GreenchClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  includeConfigure?: boolean;
  includeEnvVar?: boolean;
}): string {
  const loginCommand = resolveProviderAuthLoginCommand(params);
  const parts: string[] = [];
  if (loginCommand) {
    parts.push(`Run \`${loginCommand}\``);
  }
  if (params.includeConfigure !== false) {
    parts.push(`\`${formatCliCommand("GreenchClaw configure")}\``);
  }
  if (params.includeEnvVar) {
    parts.push("set an API key env var");
  }
  if (parts.length === 0) {
    return `Run \`${formatCliCommand("GreenchClaw configure")}\`.`;
  }
  if (parts.length === 1) {
    return `${parts[0]}.`;
  }
  if (parts.length === 2) {
    return `${parts[0]} or ${parts[1]}.`;
  }
  return `${parts[0]}, ${parts[1]}, or ${parts[2]}.`;
}
