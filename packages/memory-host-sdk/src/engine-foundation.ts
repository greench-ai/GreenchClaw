// Real workspace contract for memory engine foundation concerns.

export {
  resolveAgentContextLimits,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
  resolveSessionAgentId,
} from "./host/GreenchClaw-runtime-agent.js";
export {
  resolveMemorySearchConfig,
  resolveMemorySearchSyncConfig,
  type ResolvedMemorySearchConfig,
  type ResolvedMemorySearchSyncConfig,
} from "./host/GreenchClaw-runtime-agent.js";
export { parseDurationMs } from "./host/GreenchClaw-runtime-config.js";
export { loadConfig } from "./host/GreenchClaw-runtime-config.js";
export { resolveStateDir } from "./host/GreenchClaw-runtime-config.js";
export { resolveSessionTranscriptsDirForAgent } from "./host/GreenchClaw-runtime-config.js";
export {
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
} from "./host/GreenchClaw-runtime-config.js";
export { root } from "./host/GreenchClaw-runtime-io.js";
export { isPathInside } from "./host/fs-utils.js";
export { createSubsystemLogger } from "./host/GreenchClaw-runtime-io.js";
export { detectMime } from "./host/GreenchClaw-runtime-io.js";
export { resolveGlobalSingleton } from "./host/GreenchClaw-runtime-io.js";
export { onSessionTranscriptUpdate } from "./host/GreenchClaw-runtime-session.js";
export { splitShellArgs } from "./host/GreenchClaw-runtime-io.js";
export { runTasksWithConcurrency } from "./host/GreenchClaw-runtime-io.js";
export {
  shortenHomeInString,
  shortenHomePath,
  resolveUserPath,
  truncateUtf16Safe,
} from "./host/GreenchClaw-runtime-io.js";
export type { GreenchClawConfig } from "./host/GreenchClaw-runtime-config.js";
export type { SessionSendPolicyConfig } from "./host/GreenchClaw-runtime-config.js";
export type { SecretInput } from "./host/GreenchClaw-runtime-config.js";
export type {
  MemoryBackend,
  MemoryCitationsMode,
  MemoryQmdConfig,
  MemoryQmdIndexPath,
  MemoryQmdMcporterConfig,
  MemoryQmdSearchMode,
} from "./host/GreenchClaw-runtime-config.js";
export type { MemorySearchConfig } from "./host/GreenchClaw-runtime-config.js";
