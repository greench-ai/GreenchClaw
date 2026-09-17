import { resolveEmbeddedSessionLane } from "../agents/pi-embedded-runner/lanes.js";
import { getActiveDiagnosticAgentTurn } from "../logging/diagnostic-turn-tracker.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getQueueSize } from "../process/command-queue.js";
import { CommandLane } from "../process/lanes.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import { normalizeHeartbeatWakeReason } from "./heartbeat-reason.js";

const log = createSubsystemLogger("gateway/heartbeat");

export type HeartbeatRunResult =
  | { status: "ran"; durationMs: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export const HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT = "requests-in-flight";
export const HEARTBEAT_SKIP_CRON_IN_PROGRESS = "cron-in-progress";
export const HEARTBEAT_SKIP_LANES_BUSY = "lanes-busy";
export type RetryableHeartbeatBusySkipReason =
  | typeof HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT
  | typeof HEARTBEAT_SKIP_CRON_IN_PROGRESS
  | typeof HEARTBEAT_SKIP_LANES_BUSY;

const RETRYABLE_BUSY_SKIP_REASONS = new Set([
  HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT,
  HEARTBEAT_SKIP_CRON_IN_PROGRESS,
  HEARTBEAT_SKIP_LANES_BUSY,
]);

export function isRetryableHeartbeatBusySkipReason(reason: string): boolean {
  return RETRYABLE_BUSY_SKIP_REASONS.has(reason);
}

export type HeartbeatWakeIntent = "scheduled" | "event" | "immediate" | "manual";

export type HeartbeatWakeSource =
  | "interval"
  | "manual"
  | "exec-event"
  | "notifications-event"
  | "cron"
  | "hook"
  | "background-task"
  | "background-task-blocked"
  | "acp-spawn"
  | "cli-watchdog"
  | "restart-sentinel"
  | "retry"
  | "other";

export type HeartbeatWakeOverride = {
  target?: string;
  to?: string | undefined;
  accountId?: string | undefined;
};

export type HeartbeatWakeRequest = {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason?: string;
  agentId?: string;
  sessionKey?: string;
  heartbeat?: HeartbeatWakeOverride;
};

export type HeartbeatWakeHandler = (opts: HeartbeatWakeRequest) => Promise<HeartbeatRunResult>;

let heartbeatsEnabled = true;

export function setHeartbeatsEnabled(enabled: boolean) {
  heartbeatsEnabled = enabled;
}

export function areHeartbeatsEnabled(): boolean {
  return heartbeatsEnabled;
}

type WakeTimerKind = "normal" | "retry";
type PendingWakeReason = {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason: string;
  priority: number;
  requestedAt: number;
  agentId?: string;
  sessionKey?: string;
  heartbeat?: HeartbeatWakeOverride;
};

let handler: HeartbeatWakeHandler | null = null;
let handlerGeneration = 0;
const pendingWakes = new Map<string, PendingWakeReason>();
let scheduled = false;
let running = false;
let runningSince: number | null = null;
let runningOwnerGeneration = 0;
let timer: NodeJS.Timeout | null = null;
let timerDueAt: number | null = null;
let timerKind: WakeTimerKind | null = null;

// Wake-claim trace ring (2026-09-17 instrumentation): the last few claims,
// exposed for tests and ops introspection.
export type HeartbeatWakeClaimTrace = {
  claimId: string;
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason: string;
  targetSession: string | undefined;
  agentId: string | undefined;
  mainLaneBusy: boolean;
  sessionLaneBusy: boolean;
  claimedByTurnId: string | undefined;
  claimedByTurnKind: string | undefined;
  claimedAt: number;
};
const recentWakeClaims: HeartbeatWakeClaimTrace[] = [];
const RECENT_WAKE_CLAIM_LIMIT = 16;
let nextWakeClaimSeq = 0;

function recordWakeClaimForTest(trace: HeartbeatWakeClaimTrace): void {
  recentWakeClaims.push(trace);
  if (recentWakeClaims.length > RECENT_WAKE_CLAIM_LIMIT) {
    recentWakeClaims.shift();
  }
}

export function getRecentHeartbeatWakeClaimsForTest(): readonly HeartbeatWakeClaimTrace[] {
  return [...recentWakeClaims];
}

/**
 * Journal the moment a pending wake is claimed for dispatch (2026-09-17
 * instrumentation): who claimed it, which session it targets, whether the
 * target session lane / main lane reported busy at claim time, and which turn
 * (if any) was already active on the target session. If the claim later
 * results in a second concurrent turn, `[turn-overlap]` (from the turn
 * tracker) plus this line reconstruct the exact race.
 */
function traceWakeClaim(pendingWake: {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason: string;
  agentId?: string;
  sessionKey?: string;
}): void {
  const claimId = `wk-${Date.now().toString(36)}-${(nextWakeClaimSeq += 1)}`;
  const targetSession = pendingWake.sessionKey ?? pendingWake.agentId;
  let mainLaneBusy = false;
  let sessionLaneBusy = false;
  try {
    mainLaneBusy = getQueueSize(CommandLane.Main) > 0;
    sessionLaneBusy = pendingWake.sessionKey
      ? getQueueSize(resolveEmbeddedSessionLane(pendingWake.sessionKey)) > 0
      : false;
  } catch {
    // Queue introspection must never break dispatch; trace best-effort busy=false.
  }
  const activeTurn = pendingWake.sessionKey
    ? getActiveDiagnosticAgentTurn({ sessionKey: pendingWake.sessionKey })
    : undefined;
  const trace: HeartbeatWakeClaimTrace = {
    claimId,
    source: pendingWake.source,
    intent: pendingWake.intent,
    reason: pendingWake.reason,
    targetSession,
    agentId: pendingWake.agentId,
    mainLaneBusy,
    sessionLaneBusy,
    claimedByTurnId: activeTurn?.turnId,
    claimedByTurnKind: activeTurn?.kind,
    claimedAt: Date.now(),
  };
  recordWakeClaimForTest(trace);
  log.info(
    `[wake-claim] claimId=${claimId} source=${pendingWake.source} intent=${pendingWake.intent} reason="${pendingWake.reason}" targetSession=${
      targetSession ?? "(broadcast)"
    }${pendingWake.agentId ? ` agentId=${pendingWake.agentId}` : ""} mainLaneBusy=${mainLaneBusy} sessionLaneBusy=${sessionLaneBusy}${
      activeTurn ? ` claimedByTurnId=${activeTurn.turnId} claimedByTurnKind=${activeTurn.kind}` : ""
    }`,
    { ...trace },
  );
}

// 2026-09-16 outage #3 (post-restart repro): if a wake-handler invocation
// never settles (hung promise), `running` sticks true forever and every
// subsequent wake silently loops — zero runs, zero logs, user messages still
// work (they bypass this layer). A stuck run older than this limit is
// abandoned and the layer force-unfreezes.
const RUNNING_HANG_LIMIT_MS = 10 * 60_000;

// 2026-09-16 postmortem: retryable busy skips retried every 1s with zero
// journal output — an 8h stall was invisible. Log the skip at most once per
// minute and escalate the wording once a stall looks real.
let consecutiveBusyRetries = 0;
let lastBusySkipLogAt = 0;
const BUSY_SKIP_LOG_INTERVAL_MS = 60_000;
const BUSY_RETRY_STALL_THRESHOLD = 300; // 5 minutes of 1s retries

const DEFAULT_COALESCE_MS = 250;
const DEFAULT_RETRY_MS = 1_000;
const REASON_PRIORITY = {
  RETRY: 0,
  INTERVAL: 1,
  DEFAULT: 2,
  ACTION: 3,
} as const;

function resolveWakePriority(params: {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason: string;
}): number {
  if (params.intent === "manual" || params.intent === "immediate") {
    return REASON_PRIORITY.ACTION;
  }
  if (params.source === "retry" || params.reason === "retry") {
    return REASON_PRIORITY.RETRY;
  }
  if (
    params.intent === "scheduled" ||
    params.source === "interval" ||
    params.reason === "interval"
  ) {
    return REASON_PRIORITY.INTERVAL;
  }
  return REASON_PRIORITY.DEFAULT;
}

function normalizeWakeReason(reason?: string): string {
  return normalizeHeartbeatWakeReason(reason);
}

function normalizeWakeTarget(value?: string): string | undefined {
  const trimmed = normalizeOptionalString(value) ?? "";
  return trimmed || undefined;
}

function getWakeTargetKey(params: { agentId?: string; sessionKey?: string }) {
  const agentId = normalizeWakeTarget(params.agentId);
  const sessionKey = normalizeWakeTarget(params.sessionKey);
  return `${agentId ?? ""}::${sessionKey ?? ""}`;
}

function queuePendingWakeReason(params: {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason?: string;
  requestedAt?: number;
  agentId?: string;
  sessionKey?: string;
  heartbeat?: HeartbeatWakeOverride;
}) {
  const requestedAt = params.requestedAt ?? Date.now();
  const normalizedReason = normalizeWakeReason(params.reason);
  const normalizedAgentId = normalizeWakeTarget(params.agentId);
  const normalizedSessionKey = normalizeWakeTarget(params.sessionKey);
  const wakeTargetKey = getWakeTargetKey({
    agentId: normalizedAgentId,
    sessionKey: normalizedSessionKey,
  });
  const next: PendingWakeReason = {
    source: params.source,
    intent: params.intent,
    reason: normalizedReason,
    priority: resolveWakePriority({
      source: params.source,
      intent: params.intent,
      reason: normalizedReason,
    }),
    requestedAt,
    agentId: normalizedAgentId,
    sessionKey: normalizedSessionKey,
    heartbeat: params.heartbeat,
  };
  const previous = pendingWakes.get(wakeTargetKey);
  if (!previous) {
    pendingWakes.set(wakeTargetKey, next);
    return;
  }
  const merged =
    (next.heartbeat ?? previous.heartbeat)
      ? { ...next, heartbeat: next.heartbeat ?? previous.heartbeat }
      : next;
  if (next.priority > previous.priority) {
    pendingWakes.set(wakeTargetKey, merged);
    return;
  }
  if (next.priority === previous.priority && next.requestedAt >= previous.requestedAt) {
    pendingWakes.set(wakeTargetKey, merged);
  }
}

function schedule(coalesceMs: number, kind: WakeTimerKind = "normal") {
  const delay = Number.isFinite(coalesceMs) ? Math.max(0, coalesceMs) : DEFAULT_COALESCE_MS;
  const dueAt = Date.now() + delay;
  if (timer) {
    // Keep retry cooldown as a hard minimum delay. This prevents the
    // finally-path reschedule (often delay=0) from collapsing backoff.
    if (timerKind === "retry") {
      return;
    }
    // If existing timer fires sooner or at the same time, keep it.
    if (typeof timerDueAt === "number" && timerDueAt <= dueAt) {
      return;
    }
    // New request needs to fire sooner — preempt the existing timer.
    clearTimeout(timer);
    timer = null;
    timerDueAt = null;
    timerKind = null;
  }
  timerDueAt = dueAt;
  timerKind = kind;
  timer = setTimeout(async () => {
    timer = null;
    timerDueAt = null;
    timerKind = null;
    scheduled = false;
    const active = handler;
    if (!active) {
      return;
    }
    if (running) {
      // Hang guard (2026-09-16): an unsettled handler would otherwise freeze
      // the entire wake layer in total silence. Abandon runs older than the
      // limit and continue with the current batch.
      if (runningSince !== null && Date.now() - runningSince > RUNNING_HANG_LIMIT_MS) {
        log.error(
          `heartbeat: wake handler stuck for ${Math.round((Date.now() - runningSince) / 1000)}s — force-unfreezing wake layer (previous handler abandoned)`,
          { stuckSinceMs: runningSince },
        );
        running = false;
        runningSince = null;
        // fall through: process this batch instead of looping forever.
        // NOTE (2026-09-17 race audit): the abandoned invocation is still in
        // flight. Its `finally` must not clobber the NEW batch's `running`
        // flag — that un-serialization let a third timer dispatch while the
        // replacement batch was mid-flight (two concurrent handlers → two
        // concurrent turns on one session). The runningOwnerGeneration
        // guard below closes that hole; the abandoned invocation's cleanup is
        // a no-op once a newer batch has taken ownership.
      } else {
        scheduled = true;
        schedule(delay, kind);
        return;
      }
    }

    const pendingBatch = Array.from(pendingWakes.values());
    pendingWakes.clear();
    running = true;
    runningSince = Date.now();
    runningOwnerGeneration += 1;
    const batchGeneration = runningOwnerGeneration;
    const batchStartedAt = runningSince;
    let busySeen = false;
    try {
      for (const pendingWake of pendingBatch) {
        const wakeOpts = {
          source: pendingWake.source,
          intent: pendingWake.intent,
          reason: pendingWake.reason ?? undefined,
          ...(pendingWake.agentId ? { agentId: pendingWake.agentId } : {}),
          ...(pendingWake.sessionKey ? { sessionKey: pendingWake.sessionKey } : {}),
          ...(pendingWake.heartbeat ? { heartbeat: pendingWake.heartbeat } : {}),
        };
        traceWakeClaim(pendingWake);
        const res = await active(wakeOpts);
        if (res.status === "skipped" && isRetryableHeartbeatBusySkipReason(res.reason)) {
          // The target runtime is busy; retry this wake target soon.
          busySeen = true;
          consecutiveBusyRetries += 1;
          const nowMs = Date.now();
          log.debug(
            `[wake-retry] re-queueing wake after busy skip: reason="${res.reason}" targetSession=${
              pendingWake.sessionKey ?? pendingWake.agentId ?? "(broadcast)"
            } retryInMs=${DEFAULT_RETRY_MS} consecutiveBusyRetries=${consecutiveBusyRetries}`,
            {
              reason: res.reason,
              sessionKey: pendingWake.sessionKey,
              agentId: pendingWake.agentId,
              consecutiveBusyRetries,
            },
          );
          if (nowMs - lastBusySkipLogAt >= BUSY_SKIP_LOG_INTERVAL_MS) {
            lastBusySkipLogAt = nowMs;
            const stalled = consecutiveBusyRetries >= BUSY_RETRY_STALL_THRESHOLD;
            log.warn(
              `heartbeat: wake skipped (busy: ${res.reason}); retrying in 1s — consecutive busy retries: ${consecutiveBusyRetries}${stalled ? " — STALL SUSPECTED: busy condition has not cleared in 5+ minutes, check main-session/turn lane state" : ""}`,
              { reason: res.reason, consecutiveBusyRetries, stalled },
            );
          }
          queuePendingWakeReason({
            source: pendingWake.source,
            intent: pendingWake.intent,
            reason: pendingWake.reason ?? "retry",
            agentId: pendingWake.agentId,
            sessionKey: pendingWake.sessionKey,
            heartbeat: pendingWake.heartbeat,
          });
          schedule(DEFAULT_RETRY_MS, "retry");
        }
      }
    } catch {
      // Error is already logged by the heartbeat runner; schedule a retry.
      for (const pendingWake of pendingBatch) {
        queuePendingWakeReason({
          source: pendingWake.source,
          intent: pendingWake.intent,
          reason: pendingWake.reason ?? "retry",
          agentId: pendingWake.agentId,
          sessionKey: pendingWake.sessionKey,
          heartbeat: pendingWake.heartbeat,
        });
      }
      schedule(DEFAULT_RETRY_MS, "retry");
    } finally {
      if (batchGeneration === runningOwnerGeneration) {
        running = false;
        runningSince = null;
        if (Date.now() - batchStartedAt > 60_000) {
          log.warn(
            `heartbeat: wake batch took ${Math.round((Date.now() - batchStartedAt) / 1000)}s to settle`,
            { batchMs: Date.now() - batchStartedAt },
          );
        }
        if (!busySeen) {
          consecutiveBusyRetries = 0;
        }
        if (pendingWakes.size > 0 || scheduled) {
          schedule(delay, "normal");
        }
      } else {
        // Abandoned batch (hang-guard force-unfreeze): a newer batch owns the
        // running state. Do NOT clear `running`, reset counters, or re-arm
        // timers from here — that would un-serialize the wake layer and let
        // another timer dispatch concurrently with the active batch.
      }
    }
  }, delay);
  timer.unref?.();
}

/**
 * Register (or clear) the heartbeat wake handler.
 * Returns a disposer function that clears this specific registration.
 * Stale disposers (from previous registrations) are no-ops, preventing
 * a race where an old runner's cleanup clears a newer runner's handler.
 */
export function setHeartbeatWakeHandler(next: HeartbeatWakeHandler | null): () => void {
  handlerGeneration += 1;
  const generation = handlerGeneration;
  handler = next;
  if (next) {
    // New lifecycle starting (e.g. after SIGUSR1 in-process restart).
    // Clear any timer metadata from the previous lifecycle so stale retry
    // cooldowns do not delay a fresh handler.
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;
    timerDueAt = null;
    timerKind = null;
    // Reset module-level execution state that may be stale from interrupted
    // runs in the previous lifecycle. Without this, `running === true` from
    // an interrupted heartbeat blocks all future schedule() attempts, and
    // `scheduled === true` can cause spurious immediate re-runs.
    running = false;
    scheduled = false;
    runningOwnerGeneration = 0;
    consecutiveBusyRetries = 0;
    lastBusySkipLogAt = 0;
  }
  if (handler && pendingWakes.size > 0) {
    schedule(DEFAULT_COALESCE_MS, "normal");
  }
  return () => {
    if (handlerGeneration !== generation) {
      return;
    }
    if (handler !== next) {
      return;
    }
    handlerGeneration += 1;
    handler = null;
  };
}

export function requestHeartbeat(opts: {
  source: HeartbeatWakeSource;
  intent: HeartbeatWakeIntent;
  reason?: string;
  coalesceMs?: number;
  agentId?: string;
  sessionKey?: string;
  heartbeat?: HeartbeatWakeOverride;
}) {
  queuePendingWakeReason({
    source: opts.source,
    intent: opts.intent,
    reason: opts.reason,
    agentId: opts.agentId,
    sessionKey: opts.sessionKey,
    heartbeat: opts.heartbeat,
  });
  schedule(opts.coalesceMs ?? DEFAULT_COALESCE_MS, "normal");
}

export function hasHeartbeatWakeHandler() {
  return handler !== null;
}

export function hasPendingHeartbeatWake() {
  return pendingWakes.size > 0 || Boolean(timer) || scheduled;
}

export function resetHeartbeatWakeStateForTests() {
  if (timer) {
    clearTimeout(timer);
  }
  timer = null;
  timerDueAt = null;
  timerKind = null;
  pendingWakes.clear();
  scheduled = false;
  running = false;
  runningOwnerGeneration = 0;
  recentWakeClaims.length = 0;
  nextWakeClaimSeq = 0;
  handlerGeneration += 1;
  handler = null;
}
