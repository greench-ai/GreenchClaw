import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GreenchClawConfig } from "../config/config.js";
import {
  recordReplyEngineNoop,
  resetReplyEngineNoopsForTest,
} from "../auto-reply/reply/reply-engine-verdict.js";
import type { ReplyRunOutcome } from "../auto-reply/reply/reply-run-outcome.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";
import { HEARTBEAT_SKIP_REPLY_PRE_MODEL_NOOP } from "./heartbeat-wake.js";
import {
  seedMainSessionStore,
  setupTelegramHeartbeatPluginRuntimeForTests,
  withTempHeartbeatSandbox,
} from "./heartbeat-runner.test-utils.js";
import {
  enqueueSystemEvent,
  peekSystemEvents,
  resetSystemEventsForTest,
} from "./system-events.js";

/**
 * Item-17 stall fix (2026-09-18): the reply engine used to be able to return
 * pre-model no-ops with zero diagnostics, and the heartbeat runner ate the
 * wake/system events via the ok-empty misclassification. These tests pin the
 * split: pre-model deaths must preserve events and (item-17c) return a
 * RETRYABLE skip so the wake layer requeues them; intentional no-ops keep the
 * legacy consume behavior.
 */

const CANNED_EMPTY_BODY_REPLY = {
  text: "I didn't receive any text in your message. Please resend or add a caption.",
};

beforeEach(() => {
  setupTelegramHeartbeatPluginRuntimeForTests();
  resetSystemEventsForTest();
  resetReplyEngineNoopsForTest();
});

afterEach(() => {
  resetSystemEventsForTest();
  resetReplyEngineNoopsForTest();
  vi.restoreAllMocks();
});

type ReplyEngineMockParams = {
  reply: unknown;
  noopKind: "queue-drop" | "body-empty" | "queue-busy";
  verdict: "intentional" | "pre-model-death";
  /** item-17c: also fill the per-call replyRunOutcome out-param like the real engine does. */
  outcomePhase?: ReplyRunOutcome["phase"];
};

const createReplyEngineThatNoops = (params: ReplyEngineMockParams) =>
  vi.fn().mockImplementation(async (ctx: { SessionKey?: string }, opts?: { replyRunOutcome?: ReplyRunOutcome }) => {
    if (params.outcomePhase) {
      // Mirror the real engine: the recorder writes phase/reason on the
      // out-param before returning.
      if (opts?.replyRunOutcome) {
        opts.replyRunOutcome.phase = params.outcomePhase;
        opts.replyRunOutcome.reason = params.noopKind;
      }
    }
    recordReplyEngineNoop({
      sessionKey: ctx.SessionKey,
      kind: params.noopKind,
      verdict: params.verdict,
      reason: "test-injected reply-engine noop",
      isHeartbeat: true,
    });
    return params.reply;
  });

const runWakeHeartbeatCase = async (params: {
  getReplyFromConfig: ReturnType<typeof vi.fn>;
}): Promise<{
  result: Awaited<ReturnType<typeof runHeartbeatOnce>>;
  sendTelegram: ReturnType<typeof vi.fn>;
  sessionKey: string;
}> =>
  withTempHeartbeatSandbox(
    async ({ tmpDir, storePath }) => {
      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        chatId: "42",
      });
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
      enqueueSystemEvent("Ekho message from Gohan: deployment verified", { sessionKey });
      const result = await runHeartbeatOnce({
        cfg,
        agentId: "main",
        reason: "hook:wake",
        deps: {
          getReplyFromConfig: params.getReplyFromConfig,
          telegram: sendTelegram,
        },
      });
      return { result, sendTelegram, sessionKey };
    },
    { prefix: "GreenchClaw-noop-" },
  );

describe("heartbeat reply-engine noop verdicts (item-17 stall fix)", () => {
  it("pre-model death returns a retryable skip and preserves queued system events", async () => {
    const getReply = createReplyEngineThatNoops({
      reply: CANNED_EMPTY_BODY_REPLY,
      noopKind: "body-empty",
      verdict: "pre-model-death",
      outcomePhase: "pre-model-noop",
    });
    const { result, sessionKey } = await runWakeHeartbeatCase({ getReplyFromConfig: getReply });

    // item-17c: the run is a RETRYABLE skip, not a terminal failure — the
    // wake layer requeues it (bounded) so the payload gets a fresh turn
    // instead of waiting for the next interval heartbeat.
    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") {
      throw new Error("unreachable");
    }
    expect(result.reason).toBe(HEARTBEAT_SKIP_REPLY_PRE_MODEL_NOOP);
    // The wake event must survive for the next run — the old behavior
    // consumed it here and the stall evidence died with the turn.
    expect(peekSystemEvents(sessionKey)).toEqual(["Ekho message from Gohan: deployment verified"]);
  });

  it("pre-model death via queue-drop also preserves events and skips with retry", async () => {
    const getReply = createReplyEngineThatNoops({
      reply: undefined,
      noopKind: "queue-drop",
      verdict: "pre-model-death",
    });
    const { result, sessionKey } = await runWakeHeartbeatCase({ getReplyFromConfig: getReply });

    // Ring-only detection (no out-param phase recorded) keeps the item-17b
    // fallback semantics — minus the terminal failure.
    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") {
      throw new Error("unreachable");
    }
    expect(result.reason).toBe(HEARTBEAT_SKIP_REPLY_PRE_MODEL_NOOP);
    expect(peekSystemEvents(sessionKey)).toEqual(["Ekho message from Gohan: deployment verified"]);
  });

  it("a dispatched out-param phase overrides a stale ring pre-model-death (per-call truth)", async () => {
    // The ring sees a pre-model-death (e.g. from a sibling turn inside the
    // window) but THIS call recorded dispatched: the model ran, an empty
    // reply is intentional silence — legacy consume, not a retryable skip.
    const getReply = vi.fn().mockImplementation(async (ctx: { SessionKey?: string }, opts?: { replyRunOutcome?: ReplyRunOutcome }) => {
      if (opts?.replyRunOutcome) {
        opts.replyRunOutcome.phase = "dispatched";
      }
      recordReplyEngineNoop({
        sessionKey: ctx.SessionKey,
        kind: "body-empty",
        verdict: "pre-model-death",
        reason: "stale ring entry from a sibling turn",
        isHeartbeat: true,
      });
      return undefined;
    });
    const { result, sessionKey } = await runWakeHeartbeatCase({ getReplyFromConfig: getReply });

    expect(result.status).toBe("ran");
    expect(peekSystemEvents(sessionKey)).toEqual([]);
  });

  it("intentional noop keeps the legacy behavior: run succeeds and consumes events", async () => {
    const getReply = createReplyEngineThatNoops({
      reply: undefined,
      noopKind: "queue-busy",
      verdict: "intentional",
    });
    const { result, sessionKey } = await runWakeHeartbeatCase({ getReplyFromConfig: getReply });

    expect(result.status).toBe("ran");
    // Legacy ok-empty behavior: designed noops count as a real run.
    expect(peekSystemEvents(sessionKey)).toEqual([]);
  });

  it("no recorded verdict keeps the legacy behavior (unknown is safe-consume)", async () => {
    const getReply = vi.fn().mockResolvedValue(undefined);
    const { result, sessionKey } = await runWakeHeartbeatCase({ getReplyFromConfig: getReply });

    expect(result.status).toBe("ran");
    expect(peekSystemEvents(sessionKey)).toEqual([]);
  });
});