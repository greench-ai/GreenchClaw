import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GreenchClawConfig } from "../config/config.js";
import {
  noteConsumedCronContextKeys,
  registerOneShotHandoffCompletion,
  resetOneShotHandoffsForTests,
} from "../cron/one-shot-handoff.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";
import {
  seedMainSessionStore,
  setupTelegramHeartbeatPluginRuntimeForTests,
  withTempHeartbeatSandbox,
} from "./heartbeat-runner.test-utils.js";
import { enqueueSystemEvent, resetSystemEventsForTest } from "./system-events.js";

/**
 * item-17c: main-session deleteAfterRun one-shots hand their payload to the
 * in-memory system-event queue + a requested wake; the job entry now survives
 * until a COMPLETED heartbeat turn consumes the `cron:<jobId>` event — that
 * consumption finalizes the deferred deletion (one-shot-handoff.ts).
 */
beforeEach(() => {
  setupTelegramHeartbeatPluginRuntimeForTests();
  resetSystemEventsForTest();
  resetOneShotHandoffsForTests();
});

afterEach(() => {
  resetSystemEventsForTest();
  resetOneShotHandoffsForTests();
  vi.restoreAllMocks();
});

describe("heartbeat runner finalizes handed-off cron one-shots on event consumption (item-17c)", () => {
  it("a ran turn consuming a cron:<jobId> event invokes the deferred deletion", async () => {
    const finalizeJob1 = vi.fn().mockResolvedValue(undefined);
    const finalizeJob2 = vi.fn().mockResolvedValue(undefined);
    registerOneShotHandoffCompletion("job-1", finalizeJob1);
    registerOneShotHandoffCompletion("job-2", finalizeJob2);

    await withTempHeartbeatSandbox(
      async ({ tmpDir, storePath }) => {
        const cfg: GreenchClawConfig = {
          agents: {
            defaults: {
              workspace: tmpDir,
              heartbeat: { every: "5m", target: "none" },
            },
          },
          session: { store: storePath },
        };
        const sessionKey = await seedMainSessionStore(storePath, cfg, {
          lastChannel: "telegram",
          lastProvider: "telegram",
          lastTo: "42",
        });
        enqueueSystemEvent("Reminder: pay the electricity bill", {
          sessionKey,
          contextKey: "cron:job-1",
        });
        const getReplyFromConfig = vi.fn().mockResolvedValue(undefined);

        const result = await runHeartbeatOnce({
          cfg,
          agentId: "main",
          reason: "cron:job-1",
          deps: {
            getReplyFromConfig,
            telegram: vi.fn().mockResolvedValue({ messageId: "m1", chatId: "42" }),
          },
        });

        expect(result.status).toBe("ran");
        // The consumed cron event finalizes job-1's deferred deletion; job-2
        // was never consumed and stays pending.
        expect(finalizeJob1).toHaveBeenCalledTimes(1);
        expect(finalizeJob2).not.toHaveBeenCalled();
      },
      { prefix: "GreenchClaw-cron-handoff-" },
    );
  });

  it("a pre-model-noop turn does NOT finalize — the payload stays retryable", async () => {
    const finalize = vi.fn().mockResolvedValue(undefined);
    registerOneShotHandoffCompletion("job-stalled", finalize);

    await withTempHeartbeatSandbox(
      async ({ tmpDir, storePath }) => {
        const cfg: GreenchClawConfig = {
          agents: {
            defaults: {
              workspace: tmpDir,
              heartbeat: { every: "5m", target: "none" },
            },
          },
          session: { store: storePath },
        };
        const sessionKey = await seedMainSessionStore(storePath, cfg, {
          lastChannel: "telegram",
          lastProvider: "telegram",
          lastTo: "42",
        });
        enqueueSystemEvent("Reminder: pay the electricity bill", {
          sessionKey,
          contextKey: "cron:job-stalled",
        });
        // Engine died pre-model: the out-param records pre-model-noop and the
        // runner must neither consume the event nor finalize the deletion.
        const getReplyFromConfig = vi
          .fn()
          .mockImplementation(async (_ctx: unknown, opts?: { replyRunOutcome?: { phase?: string } }) => {
            if (opts?.replyRunOutcome) {
              opts.replyRunOutcome.phase = "pre-model-noop";
            }
            return undefined;
          });

        const result = await runHeartbeatOnce({
          cfg,
          agentId: "main",
          reason: "cron:job-stalled",
          deps: {
            getReplyFromConfig,
            telegram: vi.fn().mockResolvedValue({ messageId: "m1", chatId: "42" }),
          },
        });

        expect(result.status).toBe("skipped");
        expect(finalize).not.toHaveBeenCalled();
      },
      { prefix: "GreenchClaw-cron-handoff-noop-" },
    );
  });

  it("noteConsumedCronContextKeys ignores non-cron keys and unknown jobs", () => {
    const finalize = vi.fn().mockResolvedValue(undefined);
    registerOneShotHandoffCompletion("job-x", finalize);
    noteConsumedCronContextKeys(["exec:job-x", "cron:unknown-job", undefined, null, "cron:job-x"]);
    expect(finalize).toHaveBeenCalledTimes(1);
    // The finalized job is no longer pending.
    noteConsumedCronContextKeys(["cron:job-x"]);
    expect(finalize).toHaveBeenCalledTimes(1);
  });
});