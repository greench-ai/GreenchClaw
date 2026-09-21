import { describe, expect, it } from "vitest";
import {
  createReplyRunOutcomeRecorder,
  type ReplyRunOutcome,
} from "./reply-run-outcome.js";

describe("reply-run-outcome recorder (item-17)", () => {
  it("records the first verdict and ignores later downgrades", () => {
    const outcome: ReplyRunOutcome = {};
    const recorder = createReplyRunOutcomeRecorder(outcome, {
      sessionKey: "agent:main:main",
      isHeartbeat: true,
    });

    recorder.dispatched();
    expect(outcome.phase).toBe("dispatched");

    // A late no-op write after dispatch must not rewrite the verdict.
    recorder.noop("active-run-drop");
    expect(outcome.phase).toBe("dispatched");
    expect(outcome.reason).toBeUndefined();
  });

  it("records pre-model noops with reason and detail", () => {
    const outcome: ReplyRunOutcome = {};
    const recorder = createReplyRunOutcomeRecorder(outcome, {
      sessionKey: "agent:main:main",
      isHeartbeat: true,
    });

    recorder.noop("active-run-drop", { detail: "activeSessionId=sid-1" });
    expect(outcome.phase).toBe("pre-model-noop");
    expect(outcome.reason).toBe("active-run-drop");
    expect(outcome.detail).toBe("activeSessionId=sid-1");

    // Noop verdicts are sticky — the first reason wins.
    recorder.noop("empty-inbound-body");
    expect(outcome.reason).toBe("active-run-drop");
  });

  it("upgrades a queued hand-off to dispatched when the run proceeds", () => {
    const outcome: ReplyRunOutcome = {};
    const recorder = createReplyRunOutcomeRecorder(outcome, { sessionKey: "main" });

    recorder.queued("steer-into-active-run");
    expect(outcome.phase).toBe("queued");

    // Steering failed to queue and the run fell through to a normal dispatch.
    recorder.dispatched();
    expect(outcome.phase).toBe("dispatched");
  });

  it("keeps queued verdicts when a later hand-off records", () => {
    const outcome: ReplyRunOutcome = {};
    const recorder = createReplyRunOutcomeRecorder(outcome, { sessionKey: "main" });

    recorder.queued("enqueue-followup", { detail: "queueKey=main" });
    recorder.queued("steer-into-active-run");
    expect(outcome.phase).toBe("queued");
    expect(outcome.reason).toBe("enqueue-followup");
    expect(outcome.detail).toBe("queueKey=main");
  });

  it("degrades safely with a missing outcome object", () => {
    const recorder = createReplyRunOutcomeRecorder(undefined, { sessionKey: "main" });
    expect(() => {
      recorder.noop("empty-inbound-body", { warn: true });
      recorder.queued("enqueue-followup");
      recorder.dispatched();
    }).not.toThrow();
  });

  it("degrades safely when the outcome object is frozen", () => {
    const outcome: ReplyRunOutcome = Object.freeze({});
    const recorder = createReplyRunOutcomeRecorder(outcome, { sessionKey: "main" });
    expect(() => {
      recorder.noop("empty-inbound-body", { warn: true });
      recorder.dispatched();
    }).not.toThrow();
  });
});