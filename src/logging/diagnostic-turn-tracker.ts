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
 *
 * 2026-09-18 (item-17, ocr findings): state tracking is no longer gated on
 * the process diagnostics flag — the heartbeat stall watchdog anchors on
 * `getLastDiagnosticAgentTurnStartedAt`, and skipping turn recording when
 * diagnostics are disabled silently disarmed it. Only journal/diagnostic
 * event emission remains gated. Also: stale active turns (runs that crashed
 * without ending) are evicted after TURN_STALENESS_LIMIT_MS so ghost entries
 * cannot break overlap semantics forever, and the last-turn-started refs are
 * kind-aware and bounded.
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
  /**
   * Wall-clock of the most recent turn start per session ref (id:/key:),
   * per turn kind. Kind-keyed so a busy user conversation cannot overwrite
   * the wake-path (heartbeat) anchor the stall watchdog filters on.
   */
  lastTurnStartedAtByRef: Map<string, Map<DiagnosticAgentTurnKind, number>>;
};

/**
 * Turns legitimately run long (subagent sessions with heavy tool work can
 * stretch well past 30 minutes), so this limit is deliberately generous. A
 * turn that began but never ended (crashed/hung run) is evicted on the next
 * begin with the same identity — ghost entries otherwise keep overlapping
 * every subsequent turn forever and lie to wake-claim traces about which
 * turn is active.
 */
const TURN_STALENESS_LIMIT_MS = 60 * 60_000;

/** Bound for the last-turn-started ref map (slow-leak fix; ~50 bytes/entry). */
const LAST_TURN_STARTED_REF_LIMIT = 512;

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

/**
 * Resolve the active turn for a ref using the canonical identity first, then
 * a scan by explicit session refs. Shared by the public getter and the
 * begin-path overlap detection so both see the same active turn (the old
 * begin() checked only the canonical identity — a turn registered under a
 * sibling identity could be invisible to overlap detection while visible to
 * getActive()). Returns the map key it was found under so eviction can
 * remove the exact entry.
 */
function resolveActiveTurn(
  state: TurnTrackerState,
  ref: { sessionId?: string; sessionKey?: string },
): { identity: string; turn: ActiveDiagnosticAgentTurn } | undefined {
  const identity = resolveTurnOverlapIdentity(ref);
  const direct = state.activeByIdentity.get(identity);
  if (direct) {
    return { identity, turn: direct };
  }
  // Fall back to scanning by explicit session refs so lookups by a raw
  // sessionKey still find an active turn registered under a sibling identity.
  const sessionKey = ref.sessionKey?.trim();
  const sessionId = ref.sessionId?.trim();
  if (!sessionKey && !sessionId) {
    return undefined;
  }
  for (const [entryIdentity, turn] of state.activeByIdentity.entries()) {
    if (sessionId && turn.sessionId === sessionId) {
      return { identity: entryIdentity, turn };
    }
    if (sessionKey && turn.sessionKey === sessionKey) {
      return { identity: entryIdentity, turn };
    }
  }
  return undefined;
}

export function getActiveDiagnosticAgentTurn(
  ref: SessionRef,
): ActiveDiagnosticAgentTurn | undefined {
  // 2026-09-18: tracker reads must never throw — this is called from
  // consumption paths (wake claims, system-event claims) where a tracker
  // failure must not break dispatch.
  try {
    return resolveActiveTurn(resolveTurnTrackerState(), ref)?.turn;
  } catch {
    return undefined;
  }
}

/**
 * Last wall-clock turn start for a session ref (model-call level), or undefined
 * when no turn has been observed. The heartbeat stall watchdog uses this to
 * anchor on real agent-turn activity instead of scheduler bookkeeping.
 *
 * 2026-09-18 (item-17): pass `kinds` to filter by turn source. The stall
 * watchdog anchors on wake-path turns (`heartbeat`) — without the filter,
 * active user/cron/memory conversations refresh the anchor and can mask a
 * dead wake path for as long as the user keeps chatting.
 */
export function getLastDiagnosticAgentTurnStartedAt(
  ref: SessionRef,
  kinds?: readonly DiagnosticAgentTurnKind[],
): number | undefined {
  try {
    const state = resolveTurnTrackerState();
    let latest: number | undefined;
    for (const refKey of turnStartedAtRefs(ref)) {
      const byKind = state.lastTurnStartedAtByRef.get(refKey);
      if (byKind === undefined) {
        continue;
      }
      for (const [kind, at] of byKind.entries()) {
        if (kinds !== undefined && !kinds.includes(kind)) {
          continue;
        }
        if (latest === undefined || at > latest) {
          latest = at;
        }
      }
    }
    return latest;
  } catch {
    return undefined;
  }
}

function recordLastTurnStartedAt(params: {
  sessionId?: string;
  sessionKey?: string;
  kind: DiagnosticAgentTurnKind;
}): void {
  const state = resolveTurnTrackerState();
  const now = Date.now();
  for (const refKey of turnStartedAtRefs(params)) {
    let byKind = state.lastTurnStartedAtByRef.get(refKey);
    if (byKind) {
      // item-17b (Map insertion-order LRU fix): Map keeps an existing key's
      // original position on set(), so the prune below used to evict the
      // longest-lived continuously-updated refs first — including the
      // heartbeat ref the stall watchdog anchors on. Delete+re-set refreshes
      // insertion order on update, making the prune true LRU.
      state.lastTurnStartedAtByRef.delete(refKey);
    } else {
      byKind = new Map();
    }
    state.lastTurnStartedAtByRef.set(refKey, byKind);
    byKind.set(params.kind, now);
  }
  if (state.lastTurnStartedAtByRef.size > LAST_TURN_STARTED_REF_LIMIT) {
    // Insertion-order prune — true LRU after the delete+re-set fix above:
    // drops the least-recently-updated entries, so continuously-active refs
    // (the heartbeat session) survive while dormant ones age out.
    const excess = state.lastTurnStartedAtByRef.size - LAST_TURN_STARTED_REF_LIMIT;
    const iterator = state.lastTurnStartedAtByRef.keys();
    for (let idx = 0; idx < excess; idx += 1) {
      const oldest = iterator.next();
      if (oldest.done) {
        break;
      }
      state.lastTurnStartedAtByRef.delete(oldest.value);
    }
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
 *
 * State tracking always happens (watchdog anchor), journal/diagnostic-event
 * emission only when process diagnostics are enabled — except the
 * `[turn-overlap]` ERROR, which is a safety alarm and always journals.
 */
export function beginDiagnosticAgentTurn(params: DiagnosticAgentTurn): TrackedDiagnosticTurnRef {
  const sessionId = params.sessionId?.trim() || undefined;
  const sessionKey = params.sessionKey?.trim() || undefined;
  const kind = resolveTurnKind({
    kind: params.kind,
    trigger: params.trigger ?? params.source,
  });
  const turn: ActiveDiagnosticAgentTurn = {
    turnId: params.turnId,
    kind,
    startedAt: Date.now(),
    sessionId,
    sessionKey,
  };
  const token: TrackedDiagnosticTurnRef = { sessionId, sessionKey, turnId: params.turnId };
  try {
    const state = resolveTurnTrackerState();
    const identity = resolveTurnOverlapIdentity({ sessionId, sessionKey });
    // Staleness eviction (item-17): a turn that began but never ended (crashed
    // or hung run) would otherwise stay "active" forever — ghost entries
    // break overlap semantics and lie to wake-claim traces about which turn
    // is active. Evict loudly. Resolution is symmetric with getActive()
    // (canonical identity + sibling-ref scan).
    const activeEntry = resolveActiveTurn(state, { sessionId, sessionKey });
    const active = activeEntry?.turn;
    // Capture alarm info WITHOUT emitting (item-17b emission ordering): the
    // emissions used to run inside this try block BEFORE the registration
    // writes — if an emission threw, the bare catch below swallowed it and
    // the new turn was never registered, silently disarming the stall
    // watchdog anchor at the exact moment the overlap detector fired.
    let staleEviction: { turn: ActiveDiagnosticAgentTurn; ageMs: number } | undefined;
    let overlap: { turn: ActiveDiagnosticAgentTurn; ageMs: number } | undefined;
    if (active && active.turnId !== params.turnId) {
      const activeAgeMs = Date.now() - active.startedAt;
      if (activeAgeMs > TURN_STALENESS_LIMIT_MS) {
        // Staleness eviction (item-17): a turn that began but never ended
        // (crashed or hung run) would otherwise stay "active" forever — ghost
        // entries break overlap semantics and lie to wake-claim traces about
        // which turn is active. Evict loudly. Resolution is symmetric with
        // getActive() (canonical identity + sibling-ref scan).
        state.activeByIdentity.delete(activeEntry.identity);
        staleEviction = { turn: active, ageMs: activeAgeMs };
      } else {
        overlap = { turn: active, ageMs: activeAgeMs };
      }
    }
    // State mutations first, emissions after: the new turn is registered and
    // the watchdog anchor (recordLastTurnStartedAt) is refreshed before any
    // journal/diagnostic emission runs.
    state.activeByIdentity.set(identity, turn);
    recordLastTurnStartedAt({ sessionId, sessionKey, kind });

    if (staleEviction) {
      diag.warn(
        `[turn-stale-evicted] sessionId=${sessionId ?? "unknown"} sessionKey=${
          sessionKey ?? "unknown"
        } evictedTurnId=${staleEviction.turn.turnId} evictedKind=${
          staleEviction.turn.kind
        } ageMs=${Math.round(staleEviction.ageMs)} reason=turn never ended within staleness limit`,
        {
          evictedTurnId: staleEviction.turn.turnId,
          evictedKind: staleEviction.turn.kind,
          startedAt: staleEviction.turn.startedAt,
        },
      );
    }
    if (overlap) {
      // HEADLINE DETECTOR: a second turn is starting while another turn is
      // live on the same session. The session lane should make this
      // impossible — if this fires, lane serialization was bypassed
      // (concurrent handler dispatch, lane concurrency override, or an
      // enqueue override). Always journaled (safety alarm), not gated on
      // the diagnostics flag.
      const message = `[turn-overlap] sessionId=${sessionId ?? "unknown"} sessionKey=${
        sessionKey ?? "unknown"
      } newTurnId=${params.turnId} newKind=${kind} activeTurnId=${overlap.turn.turnId} activeKind=${
        overlap.turn.kind
      } activeStartedAt=${overlap.turn.startedAt} activeAgeMs=${Math.round(overlap.ageMs)}`;
      diag.error(message);
      if (areDiagnosticsEnabledForProcess()) {
        emitDiagnosticEvent({
          type: "agentTurn.overlap",
          sessionId,
          sessionKey,
          newTurnId: params.turnId,
          newTurnKind: kind,
          activeTurnId: overlap.turn.turnId,
          activeTurnKind: overlap.turn.kind,
          activeStartedAt: overlap.turn.startedAt,
        });
      }
    }
    if (areDiagnosticsEnabledForProcess()) {
      const queueDepth =
        params.queueDepth ??
        peekDiagnosticSessionState({ sessionId, sessionKey })?.queueDepth ??
        0;
      diag.debug(
        `[turn-start] sessionId=${sessionId ?? "unknown"} sessionKey=${
          sessionKey ?? "unknown"
        } turnId=${params.turnId} kind=${kind}${
          params.jobId ? ` jobId=${params.jobId}` : ""
        } source=${params.source ?? params.trigger ?? kind} queueDepth=${queueDepth}`,
      );
    }
  } catch {
    // Tracker bookkeeping must never break the turn it instruments.
  }
  return token;
}

/** End a tracked agent turn. Journals `[turn-end]` with the turn duration. */
export function endDiagnosticAgentTurn(token: TrackedDiagnosticTurnRef): void {
  try {
    const state = resolveTurnTrackerState();
    const identity = resolveTurnOverlapIdentity({
      sessionId: token.sessionId,
      sessionKey: token.sessionKey,
    });
    const active = state.activeByIdentity.get(identity);
    if (active?.turnId === token.turnId) {
      state.activeByIdentity.delete(identity);
      const durationMs = Math.max(0, Date.now() - active.startedAt);
      if (areDiagnosticsEnabledForProcess()) {
        diag.debug(
          `[turn-end] ${formatTurnKindFields({
            turnId: token.turnId,
            kind: active.kind,
            sessionId: token.sessionId,
            sessionKey: token.sessionKey,
          })} durationMs=${durationMs}`,
        );
      }
      return;
    }
    if (active && active.turnId !== token.turnId) {
      // The active entry was replaced by a newer turn (overlap path) — journal
      // the end without clearing the newer turn.
      if (areDiagnosticsEnabledForProcess()) {
        diag.debug(
          `[turn-end] turnId=${token.turnId} sessionId=${token.sessionId ?? "unknown"} sessionKey=${
            token.sessionKey ?? "unknown"
          } durationMs=unknown supersededByTurnId=${active.turnId}`,
        );
      }
      return;
    }
    if (areDiagnosticsEnabledForProcess()) {
      diag.debug(
        `[turn-end] turnId=${token.turnId} sessionId=${token.sessionId ?? "unknown"} sessionKey=${
          token.sessionKey ?? "unknown"
        } durationMs=unknown reason=no_active_entry`,
      );
    }
  } catch {
    // Never mask the original failure this end-call may sit next to in a
    // finally block.
  }
}

export function resetDiagnosticTurnTrackerForTest(): void {
  const state = resolveTurnTrackerState();
  state.activeByIdentity.clear();
  state.lastTurnStartedAtByRef.clear();
}