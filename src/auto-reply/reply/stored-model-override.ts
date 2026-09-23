import {
  modelKey,
  normalizeModelRef,
  resolvePersistedOverrideModelRef,
} from "../../agents/model-selection.js";
import { resolveSessionParentSessionKey } from "../../channels/plugins/session-conversation.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";

export type StoredModelOverride = {
  provider?: string;
  model: string;
  source: "session" | "parent";
  /** `modelOverrideSource` of the entry that provided the override. */
  modelOverrideSource?: "auto" | "user";
  /** `updatedAt` (epoch ms) of the entry that provided the override. */
  entryUpdatedAt?: number;
};

function resolveParentSessionKeyCandidate(params: {
  sessionKey?: string;
  parentSessionKey?: string;
}): string | null {
  const explicit = normalizeOptionalString(params.parentSessionKey);
  if (explicit && explicit !== params.sessionKey) {
    return explicit;
  }
  const derived = resolveSessionParentSessionKey(params.sessionKey);
  if (derived && derived !== params.sessionKey) {
    return derived;
  }
  return null;
}

export function resolveStoredModelOverride(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  parentSessionKey?: string;
  defaultProvider: string;
}): StoredModelOverride | null {
  const direct = resolvePersistedOverrideModelRef({
    defaultProvider: params.defaultProvider,
    overrideProvider: params.sessionEntry?.providerOverride,
    overrideModel: params.sessionEntry?.modelOverride,
  });
  if (direct) {
    return {
      ...direct,
      source: "session",
      modelOverrideSource: params.sessionEntry?.modelOverrideSource,
      entryUpdatedAt:
        typeof params.sessionEntry?.updatedAt === "number" ? params.sessionEntry.updatedAt : undefined,
    };
  }
  const parentKey = resolveParentSessionKeyCandidate({
    sessionKey: params.sessionKey,
    parentSessionKey: params.parentSessionKey,
  });
  if (!parentKey || !params.sessionStore) {
    return null;
  }
  const parentEntry = params.sessionStore[parentKey];
  const parentOverride = resolvePersistedOverrideModelRef({
    defaultProvider: params.defaultProvider,
    overrideProvider: parentEntry?.providerOverride,
    overrideModel: parentEntry?.modelOverride,
  });
  if (!parentOverride) {
    return null;
  }
  return {
    ...parentOverride,
    source: "parent",
    modelOverrideSource: parentEntry?.modelOverrideSource,
    entryUpdatedAt: typeof parentEntry?.updatedAt === "number" ? parentEntry.updatedAt : undefined,
  };
}

function resolveModelRefKey(params: {
  defaultProvider: string;
  overrideProvider?: string;
  overrideModel?: string;
}): string | null {
  const ref = resolvePersistedOverrideModelRef(params);
  if (!ref) {
    return null;
  }
  const normalized = normalizeModelRef(ref.provider, ref.model);
  return modelKey(normalized.provider, normalized.model);
}

export function isStaleHeartbeatAutoFallbackOverride(params: {
  isHeartbeat?: boolean;
  hasResolvedHeartbeatModelOverride?: boolean;
  sessionEntry?: SessionEntry;
  storedOverride?: StoredModelOverride | null;
  defaultProvider: string;
  defaultModel: string;
  primaryProvider?: string;
  primaryModel?: string;
}): boolean {
  if (params.isHeartbeat !== true || params.hasResolvedHeartbeatModelOverride === true) {
    return false;
  }
  if (params.storedOverride?.source !== "session") {
    return false;
  }
  if (params.sessionEntry?.modelOverrideSource !== "auto") {
    return false;
  }

  const primaryKey = resolveModelRefKey({
    defaultProvider: params.defaultProvider,
    overrideProvider: params.primaryProvider ?? params.defaultProvider,
    overrideModel: params.primaryModel ?? params.defaultModel,
  });
  if (!primaryKey) {
    return false;
  }

  const originKey = resolveModelRefKey({
    defaultProvider: params.defaultProvider,
    overrideProvider: params.sessionEntry.modelOverrideFallbackOriginProvider,
    overrideModel: params.sessionEntry.modelOverrideFallbackOriginModel,
  });
  if (originKey) {
    return originKey !== primaryKey;
  }

  const noticeSelectedKey = resolveModelRefKey({
    defaultProvider: params.defaultProvider,
    overrideModel: normalizeOptionalString(params.sessionEntry.fallbackNoticeSelectedModel),
  });
  if (noticeSelectedKey) {
    return noticeSelectedKey !== primaryKey;
  }

  const storedOverrideKey = resolveModelRefKey({
    defaultProvider: params.defaultProvider,
    overrideProvider: params.storedOverride.provider,
    overrideModel: params.storedOverride.model,
  });
  return storedOverrideKey !== null && storedOverrideKey !== primaryKey;
}

/**
 * Current gateway process start time (epoch ms). `process.uptime()` is used so
 * no new global state is needed; every write in this process stamps
 * `updatedAt` with a post-boot clock value.
 */
export function resolveProcessStartEpochMs(now = Date.now()): number {
  return now - Math.max(0, process.uptime() * 1000);
}

/**
 * True when a persisted AUTO model override was last touched by a previous
 * gateway process. Auto failover overrides (quota blips, rate-limit rotation)
 * must not survive a gateway restart: after a restart the session must
 * re-resolve from the configured primary instead of retrying on whatever
 * fallback model the last process stuck to (e.g. a tiny-context local model
 * that cannot even hold the session bootstrap prompt).
 *
 * User-driven overrides (`/model`, `sessions.patch`) and legacy entries without
 * a `modelOverrideSource` keep surviving restarts — only auto fallbacks reset.
 * The check is timestamp-based: `updatedAt` is stamped by every sticky-state
 * write (see applyFallbackSelectionState), so `updatedAt < processStart` means
 * no write happened in this process lifetime.
 */
export function isStaleAutoModelOverrideAcrossRestart(params: {
  storedOverride?: StoredModelOverride | null;
  now?: number;
  processStartEpochMs?: number;
}): boolean {
  const override = params.storedOverride;
  if (!override) {
    return false;
  }
  if (override.modelOverrideSource !== "auto") {
    return false;
  }
  if (typeof override.entryUpdatedAt !== "number" || !Number.isFinite(override.entryUpdatedAt)) {
    return false;
  }
  const processStart =
    params.processStartEpochMs ?? resolveProcessStartEpochMs(params.now);
  return override.entryUpdatedAt < processStart;
}
