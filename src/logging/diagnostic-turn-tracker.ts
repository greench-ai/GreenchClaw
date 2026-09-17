import {
  areDiagnosticsEnabledForProcess,
  emitDiagnosticEvent,
} from "../infra/diagnostic-events.js";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";
import { diagnosticLogger as diag } from "./diagnostic-runtime.js";
import { peekDiagnosticSessionState, type SessionRef } from "./diagnostic-session-state.js";

/**
 * Turn-level instrumentation (2026-09-17 wake/turn concurrency visibility).
 *
 * The diagnostic session-state tracker only knows a tri-state per session
 * (idle/processing/waiting). Multiple subsystems flip it, so two concurrent
 * agent turns on one session are indistinguishable from one ("current logs
 * cannot see turn overlap at all"). This module adds the missing concept:
 * exactly one active turn per session, with a kind, an id, and a loud
 * `[turn-overlap]` ERROR when a second turn starts while the first is live.
 *
 * A "turn" here is one embedded agent run (model-call level): from the moment
 * the session-lane task starts executing to its completion (see
 * pi-embedded-runner/run.ts wiring). Isolated heartbeat sessions
 * (`<base>:heartbeat`) are folded onto their base session for overlap
 * detection — a heartbeat turn racing the base session's turn is exactly the
 * "shadow turn" failure mode this tracker exists to catch.
 */

export type DiagnosticAgentTurnKind =
  | "user"
  | "heartbeat"
  | "cron"
  | "manual"
  | "memory"
  | "overflow"
  | "subagent"
  | "other";

export type ActiveDiagnosticAgentTurn = {
  turnId: string;
  kind: DiagnosticAgentTurnKind;
  startedAt: number;
  sessionId?: string;
  sessionKey?: string;
};

export type TrackedDiagnosticTurnRef = {
  sessionId?: string;
  sessionKey?: string;
  turnId: string;
};

type TurnTrackerState = {
  /** Active turn per overlap identity (base session key / session id). */
  activeByIdentity: Map<string, ActiveDiagnosticAgentTurn>;
  /** Wall-clock of the most recent turn start per session ref (id: and key:). */
  lastTurnStartedAtByRef: Map<string, number>;
};

const TURN_TRACKER_STATE_KEY = Symbol.for("GreenchClaw.diagnosticTurnTracker");

function resolveTurnTrackerState(): TurnTrackerState {
  return resolveGlobalSingleton<TurnTrackerState>(TURN_TRACKER_STATE_KEY, () => ({
    activeByIdentity: new Map(),
    lastTurnStartedAtByRef: new Map(),
  }));
}

/** Strip trailing `(:heartbeat)+` so isolated heartbeat sessions fold onto their base session. */
export function resolveTurnOverlapIdentity(params: {
  sessionId?: string;
  sessionKey?: string;
}): string {
  const sessionKey = params.sessionKey?.trim();
  if (sessionKey) {
    const base = sessionKey.replace(/(:heartbeat)+$/, "");
    if (base) {
      return `key:${base}`;
    }
  }
  const sessionId = params.sessionId?.trim();
  if (sessionId) {
    return `id:${sessionId}`;
  }
  return "unknown";
}

function turnStartedAtRefs(params: { sessionId?: string; sessionKey?: string }): string[] {
  const refs: string[] = [];
  const sessionId = params.sessionId?.trim();
  const sessionKey = params.sessionKey?.trim();
  if (sessionId) {
    refs.push(`id:${sessionId}`);
  }
  if (sessionKey) {
    refs.push(`key:${sessionKey}`);
    // Fold isolated heartbeat sessions onto their base key so the heartbeat
    // watchdog can observe isolated-heartbeat turns as activity for the base
    // session (`agent:main:heartbeat` → `agent:main`).
    const base = sessionKey.replace(/(:heartbeat)+$/, "");
    if (base && base !== sessionKey) {
      refs.push(`key:${base}`);
    }
  }
  return refs;
}

function resolveTurnKind(params: {
  kind?: DiagnosticAgentTurnKind;
  trigger?: string;
  sessionKey?: string;
}): DiagnosticAgentTurnKind {
  if (params.kind) {
    return params.kind;
  }
  const trigger = params.trigger?.trim().toLowerCase();
  switch (trigger) {
    case "user":
      return "user";
    case "heartbeat":
      return "heartbeat";
    case "cron":
      return "cron";
    case "manual":
      return "manual";
    case "memory":
      return "memory";
    case "overflow":
      return "overflow";
    default:
      return "other";
  }
}

export function getActiveDiagnosticAgentTurn(
  ref: SessionRef,
): ActiveDiagnosticAgentTurn | undefined {
  const identity = resolveTurnOverlapIdentity(ref);
  const state = resolveTurnTrackerState();
  const direct = state.activeByIdentity.get(identity);
  if (direct) {
    return direct;
  }
  // Fall back to scanning by explicit session refs so lookups by a raw
  // sessionKey still find an active turn registered under a sibling identity.
  const sessionKey = ref.sessionKey?.trim();
  const sessionId = ref.sessionId?.trim();
  if (!sessionKey && !sessionId) {
    return undefined;
  }
  for (const turn of state.activeByIdentity.values()) {
    if (sessionId && turn.sessionId === sessionId) {
      return turn;
    }
    if (sessionKey && turn.sessionKey === sessionKey) {
      return turn;
    }
  }
  return undefined;
}

/**
 * Last wall-clock turn start for a session ref (model-call level), or undefined
 * when no turn has been observed. The heartbeat stall watchdog uses this to
 * anchor on real agent-turn activity instead of scheduler bookkeeping.
 */
export function getLastDiagnosticAgentTurnStartedAt(ref: SessionRef): number | undefined {
  const state = resolveTurnTrackerState();
  let latest: number | undefined;
  for (const refKey of turnStartedAtRefs(ref)) {
    const at = state.lastTurnStartedAtByRef.get(refKey);
    if (at !== undefined && (latest === undefined || at > latest)) {
      latest = at;
    }
  }
  return latest;
}

function recordLastTurnStartedAt(params: { sessionId?: string; sessionKey?: string }): void {
  const state = resolveTurnTrackerState();
  const now = Date.now();
  for (const refKey of turnStartedAtRefs(params)) {
    state.lastTurnStartedAtByRef.set(refKey, now);
  }
}

export type DiagnosticAgentTurn = {
  sessionId?: string;
  sessionKey?: string;
  turnId: string;
  kind?: DiagnosticAgentTurnKind;
  trigger?: string;
  jobId?: string;
  source?: string;
  queueDepth?: number;
};

function formatTurnKindFields(turn: {
  turnId: string;
  kind: DiagnosticAgentTurnKind;
  sessionId?: string;
  sessionKey?: string;
}): string {
  return `turnId=${turn.turnId} kind=${turn.kind} sessionId=${turn.sessionId ?? "unknown"} sessionKey=${turn.sessionKey ?? "unknown"}`;
}

/**
 * Begin a tracked agent turn. Journals `[turn-start]` with sessionId, turnId,
 * turn kind and queueDepth; when another turn is already active for the same
 * session (base session — isolated `:heartbeat` keys fold onto their base),
 * journals `[turn-overlap]` at ERROR with both turn ids and kinds. Returns a
 * token used to end the turn.
 */
export function beginDiagnosticAgentTurn(params: DiagnosticAgentTurn): TrackedDiagnosticTurnRef {
  const sessionId = params.sessionId?.trim() || undefined;
  const sessionKey = params.sessionKey?.trim() || undefined;
  const kind = resolveTurnKind({
    kind: params.kind,
    trigger: params.trigger ?? params.source,
    sessionKey,
  });
  const turn: ActiveDiagnosticAgentTurn = {
    turnId: params.turnId,
    kind,
    startedAt: Date.now(),
    sessionId,
    sessionKey,
  };
  const token: TrackedDiagnosticTurnRef = { sessionId, sessionKey, turnId: params.turnId };
  if (!areDiagnosticsEnabledForProcess()) {
    return token;
  }
  const state = resolveTurnTrackerState();
  const identity = resolveTurnOverlapIdentity({ sessionId, sessionKey });
  const active = state.activeByIdentity.get(identity);
  if (active && active.turnId !== params.turnId) {
    // HEADLINE DETECTOR: a second turn is starting while another turn is live
    // on the same session. The session lane should make this impossible — if
    // this fires, lane serialization was bypassed (concurrent handler
    // dispatch, lane concurrency override, or an enqueue override).
    const message = `[turn-overlap] sessionId=${sessionId ?? "unknown"} sessionKey=${
      sessionKey ?? "unknown"
    } newTurnId=${params.turnId} newKind=${kind} activeTurnId=${active.turnId} activeKind=${
      active.kind
    } activeStartedAt=${active.startedAt} activeAgeMs=${Math.round(Date.now() - active.startedAt)}`;
    diag.error(message);
    emitDiagnosticEvent({
      type: "agentTurn.overlap",
      sessionId,
      sessionKey,
      newTurnId: params.turnId,
      newTurnKind: kind,
      activeTurnId: active.turnId,
      activeTurnKind: active.kind,
      activeStartedAt: active.startedAt,
    });
  }
  state.activeByIdentity.set(identity, turn);
  recordLastTurnStartedAt({ sessionId, sessionKey });
  const queueDepth =
    params.queueDepth ?? peekDiagnosticSessionState({ sessionId, sessionKey })?.queueDepth ?? 0;
  diag.debug(
    `[turn-start] sessionId=${sessionId ?? "unknown"} sessionKey=${
      sessionKey ?? "unknown"
    } turnId=${params.turnId} kind=${kind}${
      params.jobId ? ` jobId=${params.jobId}` : ""
    } source=${params.source ?? params.trigger ?? kind} queueDepth=${queueDepth}`,
  );
  return token;
}

/** End a tracked agent turn. Journals `[turn-end]` with the turn duration. */
export function endDiagnosticAgentTurn(token: TrackedDiagnosticTurnRef): void {
  if (!areDiagnosticsEnabledForProcess()) {
    return;
  }
  const state = resolveTurnTrackerState();
  const identity = resolveTurnOverlapIdentity({
    sessionId: token.sessionId,
    sessionKey: token.sessionKey,
  });
  const active = state.activeByIdentity.get(identity);
  if (active?.turnId === token.turnId) {
    state.activeByIdentity.delete(identity);
    const durationMs = Math.max(0, Date.now() - active.startedAt);
    diag.debug(
      `[turn-end] ${formatTurnKindFields({
        turnId: token.turnId,
        kind: active.kind,
        sessionId: token.sessionId,
        sessionKey: token.sessionKey,
      })} durationMs=${durationMs}`,
    );
    return;
  }
  if (active && active.turnId !== token.turnId) {
    // The active entry was replaced by a newer turn (overlap path) — journal
    // the end without clearing the newer turn.
    diag.debug(
      `[turn-end] turnId=${token.turnId} sessionId=${token.sessionId ?? "unknown"} sessionKey=${
        token.sessionKey ?? "unknown"
      } durationMs=unknown supersededByTurnId=${active.turnId}`,
    );
    return;
  }
  diag.debug(
    `[turn-end] turnId=${token.turnId} sessionId=${token.sessionId ?? "unknown"} sessionKey=${
      token.sessionKey ?? "unknown"
    } durationMs=unknown reason=no_active_entry`,
  );
}

export function resetDiagnosticTurnTrackerForTest(): void {
  const state = resolveTurnTrackerState();
  state.activeByIdentity.clear();
  state.lastTurnStartedAtByRef.clear();
}
