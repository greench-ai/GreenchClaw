export const GREENCHCLAW_OWNER_ONLY_CORE_TOOL_NAMES = ["cron", "gateway", "nodes"] as const;

const GREENCHCLAW_OWNER_ONLY_CORE_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  GREENCHCLAW_OWNER_ONLY_CORE_TOOL_NAMES,
);

export function isGreenchClawOwnerOnlyCoreToolName(toolName: string): boolean {
  return GREENCHCLAW_OWNER_ONLY_CORE_TOOL_NAME_SET.has(toolName);
}
