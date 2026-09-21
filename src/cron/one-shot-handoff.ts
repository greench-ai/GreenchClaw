import { resolveGlobalSingleton } from "../shared/global-singleton.js";

/**
 * One-shot deleteAfterRun hand-off completion registry (item-17c).
 *
 * A main-session cron job with `deleteAfterRun` "hands off" its payload by
 * enqueuing an in-memory system event and requesting a heartbeat wake; the
 * agent turn itself runs LATER on that wake. Before item-17c the job entry
 * was deleted at dispatch time (the hand-off returned ok → shouldDelete),
 * so a process death between hand-off and turn completion lost the execution
 * entirely: the job entry (the only durable record of the payload) was
 * already gone and the in-memory event evaporated.
 *
 * Now the hand-off returns `turnCompleted: false` — applyJobResult keeps the
 * (disabled) entry and the cron service registers a finalize callback here.
 * When the heartbeat runner consumes the queued event on a completed turn,
 * it notes the consumed `cron:<jobId>` context keys and the registry invokes
 * the callback, deleting the entry at true completion (emit removed). If the
 * turn never completes (process death, persistent pre-model noops) the entry
 * survives as a disabled audit record an operator can inspect or re-enable.
 */
type OneShotHandoffState = {
  /** jobId → finalize deletion callback (set at hand-off). */
  pending: Map<string, () => Promise<void>>;
};

const ONE_SHOT_HANDOFF_STATE_KEY = Symbol.for("GreenchClaw.cron.oneShotHandoffs");

function getState(): OneShotHandoffState {
  return resolveGlobalSingleton<OneShotHandoffState>(ONE_SHOT_HANDOFF_STATE_KEY, () => ({
    pending: new Map(),
  }));
}

/**
 * Register the deferred deletion for a handed-off one-shot job. Called by the
 * cron service at hand-off; `finalize` owns its own error handling (it must
 * never reject — failures are logged by the closure, the entry simply stays).
 */
export function registerOneShotHandoffCompletion(
  jobId: string,
  finalize: () => Promise<void>,
): void {
  if (!jobId) {
    return;
  }
  getState().pending.set(jobId, finalize);
}

/**
 * Notify the registry that system events with these context keys were
 * CONSUMED by a completed heartbeat turn (claimPath "run" — the model saw
 * the payload). Context keys look like `cron:<jobId>`; a matching handed-off
 * one-shot finalizes (deleted at completion).
 */
export function noteConsumedCronContextKeys(
  contextKeys: ReadonlyArray<string | null | undefined>,
): void {
  const state = getState();
  for (const key of contextKeys) {
    if (!key || !key.startsWith("cron:")) {
      continue;
    }
    const jobId = key.slice("cron:".length);
    const finalize = state.pending.get(jobId);
    if (!finalize) {
      continue;
    }
    state.pending.delete(jobId);
    // Finalize closures never reject (internal try/catch + deps.log); the
    // catch here is a belt-and-suspenders against a buggy closure so a
    // cleanup failure can never surface as an unhandled rejection.
    void finalize().catch(() => undefined);
  }
}

/** Test/ops introspection: is a handed-off one-shot still pending deletion? */
export function hasPendingOneShotHandoff(jobId: string): boolean {
  return getState().pending.has(jobId);
}

/** Test-only: drop all pending hand-off finalizers. */
export function resetOneShotHandoffsForTests(): void {
  getState().pending.clear();
}