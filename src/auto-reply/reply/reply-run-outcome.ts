import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("auto-reply/reply");

/**
 * Reply-run verdict (2026-09-18 item-17 stall fix).
 *
 * The heartbeat/main-lane stall class (Sep 16-17) dies INSIDE the reply engine
 * BEFORE the model is ever called — and every such path was silent: no log, no
 * event, `ok-empty` classification, wake events consumed by a run that never
 * turned. The runner cannot distinguish "model ran and chose silence"
 * (intentional empty — consuming queued events is correct) from "engine died
 * pre-model" (queued events must NOT be consumed — they are the retry vehicle
 * and the only evidence).
 *
 * `getReplyFromConfig` (and its callees) record the verdict into this out-param
 * on EVERY return path pre-dispatch; the heartbeat runner reads it after the
 * call and classifies the run. Never die silently: each pre-model return also
 * journals a `[reply-noop]` line (info/warn — journal-visible in production,
 * unlike logVerbose).
 *
 * Phase semantics:
 * - "dispatched": the run reached the agent runner past the queue gates —
 *   model-call level. Empty replies past this point are intentional (silent
 *   policy, heartbeat ack token): consuming queued events is correct.
 * - "queued": the prompt was handed off (steered into an active run or
 *   enqueued as a followup) — a turn will process it later. Treated like
 *   "dispatched" by the heartbeat runner (the payload is in a live turn).
 * - "pre-model-noop": the run returned without reaching the agent runner AND
 *   without handing the prompt to a live/queued turn. For heartbeat runs this
 *   must NOT consume queued system events and must be retryable — see
 *   HEARTBEAT_SKIP_REPLY_PRE_MODEL_NOOP in infra/heartbeat-wake.ts.
 */
export type ReplyRunOutcomePhase = "dispatched" | "queued" | "pre-model-noop";

export type ReplyRunOutcome = {
  phase?: ReplyRunOutcomePhase;
  /** Which path short-circuited the run (pre-model-noop / queued). */
  reason?: string;
  /** Extra diagnostic context (e.g. active session id behind a drop). */
  detail?: string;
};

export type ReplyRunOutcomeRecorder = {
  /** Record a pre-model short-circuit and journal a `[reply-noop]` line. */
  noop(reason: string, opts?: { detail?: string; warn?: boolean }): void;
  /** Record a hand-off to a live/queued turn. */
  queued(reason: string, opts?: { detail?: string }): void;
  /** Record that the run reached the agent runner (model-call level). */
  dispatched(): void;
};

/**
 * Resolve the recorder for a run. Callers thread `opts.replyRunOutcome` through
 * `GetReplyOptions`; the returned recorder is safe to call from any return path
 * (including catch blocks) — a missing or frozen out-param degrades to no-op
 * tracing that still journals.
 */
export function createReplyRunOutcomeRecorder(
  outcome: ReplyRunOutcome | undefined,
  params: {
    sessionKey?: string;
    sessionId?: string;
    isHeartbeat?: boolean;
  },
): ReplyRunOutcomeRecorder {
  const write = (patch: ReplyRunOutcome) => {
    if (!outcome || typeof outcome !== "object") {
      return;
    }
    try {
      if (outcome.phase === undefined) {
        outcome.phase = patch.phase;
        if (patch.reason !== undefined) {
          outcome.reason = patch.reason;
        }
        if (patch.detail !== undefined) {
          outcome.detail = patch.detail;
        }
      } else if (
        outcome.phase === "queued" &&
        patch.phase === "dispatched" &&
        patch.reason === undefined
      ) {
        // A hand-off can fall through to a normal dispatch (e.g. steering
        // failed to queue and the run proceeded) — a real dispatch supersedes
        // the queued verdict.
        outcome.phase = "dispatched";
      }
    } catch {
      // Out-param bookkeeping must never break a reply path.
    }
  };
  const label = `sessionKey=${params.sessionKey ?? "unknown"}${
    params.sessionId ? ` sessionId=${params.sessionId}` : ""
  } isHeartbeat=${params.isHeartbeat === true}`;
  return {
    noop(reason, opts) {
      write({ phase: "pre-model-noop", reason, detail: opts?.detail });
      const line = `[reply-noop] path=${reason} ${label}${opts?.detail ? ` ${opts.detail}` : ""}`;
      if (opts?.warn) {
        log.warn(line, { replyNoopReason: reason, sessionKey: params.sessionKey });
      } else {
        log.info(line, { replyNoopReason: reason, sessionKey: params.sessionKey });
      }
    },
    queued(reason, opts) {
      write({ phase: "queued", reason, detail: opts?.detail });
      log.info(
        `[reply-handoff] path=${reason} ${label}${opts?.detail ? ` ${opts.detail}` : ""}`,
        { replyHandoffReason: reason, sessionKey: params.sessionKey },
      );
    },
    dispatched() {
      write({ phase: "dispatched" });
    },
  };
}