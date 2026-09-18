import { createSubsystemLogger } from "../../logging/subsystem.js";

/**
 * Reply-engine turn verdicts (2026-09-18, item-17 stall fix).
 *
 * The heartbeat stall (Sep 16/17 incidents) was localized to the reply engine
 * returning a pre-model no-op: the turn dispatched, `getReplyFromConfig`
 * returned without ever calling the model, and the heartbeat runner
 * misclassified the empty reply as `ok-empty` — consuming wake/system events
 * and reporting `ran`. The evidence for the stall died with every eaten turn.
 *
 * Every silent pre-model return path in the reply engine now records a noop
 * verdict here (journal-visible `[reply-noop]` trace + in-memory ring). The
 * heartbeat runner consults the verdict after the turn: intentional noops
 * (designed fast paths: commands, hooks, directive replies) keep the legacy
 * behavior, while `pre-model-death` noops must NOT consume events and surface
 * as a loud `failed` run so the payload stays retryable.
 */

const log = createSubsystemLogger("gateway/reply");

export type ReplyEngineNoopKind =
  /** Native slash command handled on the fast path. */
  | "native-slash-command"
  /** A lost reply from a previous turn was replayed. */
  | "pending-final-delivery"
  /** A directive produced a direct reply (e.g. /model, /status). */
  | "directive-reply"
  /** An inline action produced a direct reply. */
  | "inline-action-reply"
  /** A before_agent_reply plugin hook handled the turn. */
  | "before-agent-reply-hook"
  /** Per-message queue returned a busy reply (active run still draining). */
  | "queue-busy"
  /** Explicit think directive with an unsupported level produced an error reply. */
  | "think-level-unsupported"
  /** Queued as a followup behind an active run (will execute later). */
  | "queue-followup"
  /** Steered into an active streaming run. */
  | "queue-steer"
  /** Whole-message command from an unauthorized sender was dropped (undefined). */
  | "unauthorized-command"
  /** Inbound body normalized to empty; canned reply returned, model never called. */
  | "body-empty"
  /** Active run on the session caused the heartbeat turn to be dropped (undefined). */
  | "queue-drop";

/**
 * `intentional`: a designed fast path handled the turn — real work happened
 * (command executed, hook replied, message queued) and the heartbeat runner
 * may treat the turn as a normal ok-empty/ok-token outcome.
 * `pre-model-death`: the engine returned without reaching the model and
 * without doing equivalent work — for a heartbeat this is a stall-class
 * failure; wake/system events must be preserved.
 */
export type ReplyEngineNoopVerdict = "intentional" | "pre-model-death";

export type ReplyEngineNoopEntry = {
  at: number;
  sessionKey: string | undefined;
  kind: ReplyEngineNoopKind;
  verdict: ReplyEngineNoopVerdict;
  reason: string;
  isHeartbeat: boolean;
  detail?: Record<string, unknown>;
};

export type RecordReplyEngineNoopParams = {
  sessionKey?: string;
  kind: ReplyEngineNoopKind;
  verdict: ReplyEngineNoopVerdict;
  reason: string;
  isHeartbeat?: boolean;
  detail?: Record<string, unknown>;
};

const REPLY_ENGINE_NOOP_STATE_KEY = Symbol.for("GreenchClaw.replyEngineNoop.state");

type ReplyEngineNoopState = {
  entries: ReplyEngineNoopEntry[];
};

const RECENT_NOOP_LIMIT = 32;

function resolveState(): ReplyEngineNoopState {
  const globalRecord = globalThis as Record<symbol, unknown>;
  let state = globalRecord[REPLY_ENGINE_NOOP_STATE_KEY] as ReplyEngineNoopState | undefined;
  if (!state) {
    state = { entries: [] };
    globalRecord[REPLY_ENGINE_NOOP_STATE_KEY] = state;
  }
  return state;
}

/**
 * Record a pre-model noop return from the reply engine.
 *
 * Intentional noops log at info; pre-model deaths log at warn (or error when
 * they occur on a heartbeat turn — the stall-relevant case). The log line is
 * deliberately journal-visible: production-invisible skip paths are where
 * stall bugs hide (2026-09-17 night dig lesson).
 */
export function recordReplyEngineNoop(params: RecordReplyEngineNoopParams): void {
  const isHeartbeat = params.isHeartbeat === true;
  const entry: ReplyEngineNoopEntry = {
    at: Date.now(),
    sessionKey: params.sessionKey,
    kind: params.kind,
    verdict: params.verdict,
    reason: params.reason,
    isHeartbeat,
    ...(params.detail ? { detail: params.detail } : {}),
  };
  const state = resolveState();
  state.entries.push(entry);
  if (state.entries.length > RECENT_NOOP_LIMIT) {
    state.entries.shift();
  }
  const line = `[reply-noop] kind=${entry.kind} verdict=${entry.verdict} session=${
    entry.sessionKey ?? "(unknown)"
  } isHeartbeat=${isHeartbeat} reason="${entry.reason}"`;
  if (entry.verdict === "pre-model-death") {
    if (isHeartbeat) {
      log.error(line, { ...entry });
    } else {
      log.warn(line, { ...entry });
    }
    return;
  }
  log.info(line, { ...entry });
}

/**
 * Resolve the most recent reply-engine noop recorded for a session within
 * the `[sinceMs, now]` window (the runner passes its turn start time).
 * Returns `undefined` when no noop was recorded in the window — e.g. when the
 * turn actually reached the model, or when the session keys do not line up.
 */
export function resolveRecentReplyEngineNoop(params: {
  sessionKey?: string;
  sinceMs: number;
  nowMs?: number;
}): ReplyEngineNoopEntry | undefined {
  const state = resolveState();
  const nowMs = params.nowMs ?? Date.now();
  const sessionKey = params.sessionKey;
  for (let idx = state.entries.length - 1; idx >= 0; idx -= 1) {
    const entry = state.entries[idx];
    if (entry.at < params.sinceMs || entry.at > nowMs) {
      continue;
    }
    if (sessionKey !== undefined && entry.sessionKey !== sessionKey) {
      continue;
    }
    return entry;
  }
  return undefined;
}

/** Test/ops introspection: recent noop ring (oldest first). */
export function getRecentReplyEngineNoopsForTest(): readonly ReplyEngineNoopEntry[] {
  return [...resolveState().entries];
}

/** Test-only: clear the noop ring. */
export function resetReplyEngineNoopsForTest(): void {
  resolveState().entries = [];
}