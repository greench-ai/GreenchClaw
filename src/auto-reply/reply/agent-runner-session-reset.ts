import fs from "node:fs";
import type { SessionEntry } from "../../config/sessions.js";
import {
  resolveAgentIdFromSessionKey,
  resolveSessionFilePath,
  resolveSessionFilePathOptions,
  resolveSessionTranscriptPath,
  updateSessionStore,
} from "../../config/sessions.js";
import { generateSecureUuid } from "../../infra/secure-random.js";
import { defaultRuntime } from "../../runtime.js";
import { refreshQueuedFollowupSession, type FollowupRun } from "./queue.js";
import { replayRecentUserAssistantMessages } from "./session-transcript-replay.js";

type ResetSessionOptions = {
  failureLabel: string;
  buildLogMessage: (nextSessionId: string) => string;
  cleanupTranscripts?: boolean;
};

const deps = {
  generateSecureUuid,
  updateSessionStore,
  refreshQueuedFollowupSession,
  error: (message: string) => defaultRuntime.error(message),
};

export function setAgentRunnerSessionResetTestDeps(overrides?: Partial<typeof deps>): void {
  Object.assign(deps, {
    generateSecureUuid,
    updateSessionStore,
    refreshQueuedFollowupSession,
    error: (message: string) => defaultRuntime.error(message),
    ...overrides,
  });
}

export async function resetReplyRunSession(params: {
  options: ResetSessionOptions;
  sessionKey?: string;
  queueKey: string;
  activeSessionEntry?: SessionEntry;
  activeSessionStore?: Record<string, SessionEntry>;
  storePath?: string;
  messageThreadId?: string;
  followupRun: FollowupRun;
  onActiveSessionEntry: (entry: SessionEntry) => void;
  onNewSession: (newSessionId: string, nextSessionFile: string) => void;
}): Promise<boolean> {
  if (!params.sessionKey || !params.activeSessionStore || !params.storePath) {
    return false;
  }
  const prevEntry = params.activeSessionStore[params.sessionKey] ?? params.activeSessionEntry;
  if (!prevEntry) {
    return false;
  }
  const prevSessionId = params.options.cleanupTranscripts ? prevEntry.sessionId : undefined;
  // Capture the pre-failover primary before clearing the sticky selection: the
  // queued runs still carry the failover model (e.g. a tiny-context fallback),
  // and retrying a fresh session on it re-enters the same overflow loop. Revert
  // them to the origin so the next run resolves from the clean session entry.
  const originProvider = prevEntry.modelOverrideFallbackOriginProvider;
  const originModel = prevEntry.modelOverrideFallbackOriginModel;
  const nextSessionId = deps.generateSecureUuid();
  const now = Date.now();
  const nextEntry: SessionEntry = {
    ...prevEntry,
    sessionId: nextSessionId,
    updatedAt: now,
    sessionStartedAt: now,
    usageFamilyKey: prevEntry.usageFamilyKey ?? params.sessionKey,
    usageFamilySessionIds: Array.from(
      new Set([...(prevEntry.usageFamilySessionIds ?? []), prevEntry.sessionId, nextSessionId]),
    ),
    lastInteractionAt: now,
    systemSent: false,
    abortedLastRun: false,
    modelProvider: undefined,
    model: undefined,
    providerOverride: undefined,
    modelOverride: undefined,
    modelOverrideSource: undefined,
    modelOverrideFallbackOriginProvider: undefined,
    modelOverrideFallbackOriginModel: undefined,
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    totalTokensFresh: false,
    estimatedCostUsd: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
    contextTokens: undefined,
    systemPromptReport: undefined,
    fallbackNoticeSelectedModel: undefined,
    fallbackNoticeActiveModel: undefined,
    fallbackNoticeReason: undefined,
  };
  const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
  const nextSessionFile = resolveSessionTranscriptPath(
    nextSessionId,
    agentId,
    params.messageThreadId,
  );
  nextEntry.sessionFile = nextSessionFile;
  params.activeSessionStore[params.sessionKey] = nextEntry;
  try {
    await deps.updateSessionStore(params.storePath, (store) => {
      store[params.sessionKey!] = nextEntry;
    });
  } catch (err) {
    deps.error(
      `Failed to persist session reset after ${params.options.failureLabel} (${params.sessionKey}): ${String(err)}`,
    );
  }
  // Silent rotations (compaction/role-ordering) fire without user intent, so
  // preserve recent user/assistant turns for direct-chat continuity.
  await replayRecentUserAssistantMessages({
    sourceTranscript: prevEntry.sessionFile,
    targetTranscript: nextSessionFile,
    newSessionId: nextSessionId,
  });
  params.followupRun.run.sessionId = nextSessionId;
  params.followupRun.run.sessionFile = nextSessionFile;
  // Drop the sticky failover selection on the in-memory run so the retry does
  // not pin the new session to the failed fallback model.
  if (originProvider && originModel) {
    params.followupRun.run.provider = originProvider;
    params.followupRun.run.model = originModel;
  }
  params.followupRun.run.hasSessionModelOverride = false;
  params.followupRun.run.modelOverrideSource = undefined;
  deps.refreshQueuedFollowupSession({
    key: params.queueKey,
    previousSessionId: prevEntry.sessionId,
    nextSessionId,
    nextSessionFile,
    ...(originProvider && originModel
      ? {
          nextProvider: originProvider,
          nextModel: originModel,
          nextModelOverrideSource: undefined,
        }
      : {}),
  });
  params.onActiveSessionEntry(nextEntry);
  params.onNewSession(nextSessionId, nextSessionFile);
  deps.error(params.options.buildLogMessage(nextSessionId));
  if (params.options.cleanupTranscripts && prevSessionId) {
    const transcriptCandidates = new Set<string>();
    const resolved = resolveSessionFilePath(
      prevSessionId,
      prevEntry,
      resolveSessionFilePathOptions({ agentId, storePath: params.storePath }),
    );
    if (resolved) {
      transcriptCandidates.add(resolved);
    }
    transcriptCandidates.add(resolveSessionTranscriptPath(prevSessionId, agentId));
    for (const candidate of transcriptCandidates) {
      try {
        fs.unlinkSync(candidate);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
  return true;
}
