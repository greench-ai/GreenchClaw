import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getRecentReplyEngineNoopsForTest,
  recordReplyEngineNoop,
  resetReplyEngineNoopsForTest,
  resolveRecentReplyEngineNoop,
} from "./reply-engine-verdict.js";

describe("reply-engine verdict ring (item-17)", () => {
  beforeEach(() => {
    resetReplyEngineNoopsForTest();
  });

  afterEach(() => {
    resetReplyEngineNoopsForTest();
  });

  it("resolves the most recent entry within the window for the session", () => {
    const before = Date.now();
    recordReplyEngineNoop({
      sessionKey: "agent:main",
      kind: "body-empty",
      verdict: "pre-model-death",
      reason: "inbound body empty after normalization",
      isHeartbeat: true,
      detail: { bodyLen: 0 },
    });
    const entry = resolveRecentReplyEngineNoop({
      sessionKey: "agent:main",
      sinceMs: before,
    });
    expect(entry?.kind).toBe("body-empty");
    expect(entry?.verdict).toBe("pre-model-death");
    expect(entry?.detail).toEqual({ bodyLen: 0 });
  });

  it("ignores entries recorded after the lookup window closes (older turns)", () => {
    recordReplyEngineNoop({
      sessionKey: "agent:main",
      kind: "queue-drop",
      verdict: "pre-model-death",
      reason: "old",
      isHeartbeat: true,
    });
    // Look up with a window that closed before the entry was recorded.
    const entry = resolveRecentReplyEngineNoop({
      sessionKey: "agent:main",
      sinceMs: Date.now() - 60_000,
      nowMs: Date.now() - 1_000,
    });
    expect(entry).toBeUndefined();
  });

  it("does not leak one session's noop into another session's lookup", () => {
    const before = Date.now();
    recordReplyEngineNoop({
      sessionKey: "agent:other",
      kind: "body-empty",
      verdict: "pre-model-death",
      reason: "different session",
      isHeartbeat: true,
    });
    const entry = resolveRecentReplyEngineNoop({
      sessionKey: "agent:main",
      sinceMs: before,
    });
    expect(entry).toBeUndefined();
  });

  it("keeps only the last ring entry when multiple noops land in a window", () => {
    const before = Date.now();
    recordReplyEngineNoop({
      sessionKey: "agent:main",
      kind: "queue-busy",
      verdict: "intentional",
      reason: "first",
      isHeartbeat: true,
    });
    recordReplyEngineNoop({
      sessionKey: "agent:main",
      kind: "body-empty",
      verdict: "pre-model-death",
      reason: "second",
      isHeartbeat: true,
    });
    const entry = resolveRecentReplyEngineNoop({
      sessionKey: "agent:main",
      sinceMs: before,
    });
    expect(entry?.kind).toBe("body-empty");
    expect(getRecentReplyEngineNoopsForTest()).toHaveLength(2);
  });

  it("does not let other sessions' traffic evict a session's pre-model-death (item-17b HIGH)", () => {
    const before = Date.now();
    // Flood the ring with entries from OTHER sessions — far beyond the 32 cap.
    for (let i = 0; i < 40; i += 1) {
      recordReplyEngineNoop({
        sessionKey: `agent:other-${i % 4}`,
        kind: "native-slash-command",
        verdict: "intentional",
        reason: `flood-${i}`,
        isHeartbeat: false,
      });
    }
    // A genuine pre-model-death on the watched session AFTER the flood.
    recordReplyEngineNoop({
      sessionKey: "agent:main",
      kind: "body-empty",
      verdict: "pre-model-death",
      reason: "must survive the flood",
      isHeartbeat: true,
    });
    const entry = resolveRecentReplyEngineNoop({
      sessionKey: "agent:main",
      sinceMs: before,
    });
    expect(entry?.kind).toBe("body-empty");
    expect(entry?.verdict).toBe("pre-model-death");
    expect(entry?.reason).toBe("must survive the flood");
  });

  it("caps each session's ring independently", () => {
    for (let i = 0; i < 40; i += 1) {
      recordReplyEngineNoop({
        sessionKey: "agent:main",
        kind: "queue-busy",
        verdict: "intentional",
        reason: `burst-${i}`,
        isHeartbeat: false,
      });
    }
    // Session main's ring is capped at 32; another session's ring stays empty.
    const mainEntries = getRecentReplyEngineNoopsForTest().filter((e) => e.sessionKey === "agent:main");
    expect(mainEntries).toHaveLength(32);
    expect(mainEntries[0]?.reason).toBe("burst-8");
  });
});