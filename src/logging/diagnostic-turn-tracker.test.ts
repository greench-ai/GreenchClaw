import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueCommandInLane,
  resetCommandQueueStateForTest,
  setCommandLaneConcurrency,
} from "../process/command-queue.js";
import { diagnosticLogger as diag } from "./diagnostic-runtime.js";
import { resetDiagnosticSessionStateForTest } from "./diagnostic-session-state.js";
import {
  beginDiagnosticAgentTurn,
  endDiagnosticAgentTurn,
  getActiveDiagnosticAgentTurn,
  getLastDiagnosticAgentTurnStartedAt,
  resetDiagnosticTurnTrackerForTest,
  resolveTurnOverlapIdentity,
  type TrackedDiagnosticTurnRef,
} from "./diagnostic-turn-tracker.js";

const SESSION_KEY = "agent_sasuke:main";
const ISOLATED_SESSION_KEY = "agent_sasuke:main:heartbeat";
const OTHER_SESSION_KEY = "telegram:12345:agent_sasuke";

function beginTurn(params: {
  turnId: string;
  kind?: "user" | "heartbeat" | "cron" | "other";
  sessionKey?: string;
  sessionId?: string;
}): TrackedDiagnosticTurnRef {
  return beginDiagnosticAgentTurn({
    turnId: params.turnId,
    kind: params.kind,
    sessionKey: params.sessionKey ?? SESSION_KEY,
    sessionId: params.sessionId ?? `session-${params.turnId}`,
  });
}

describe("diagnostic turn tracker", () => {
  beforeEach(() => {
    resetDiagnosticTurnTrackerForTest();
    resetDiagnosticSessionStateForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDiagnosticTurnTrackerForTest();
    resetDiagnosticSessionStateForTest();
  });

  it("folds isolated heartbeat sessions onto their base session for overlap identity", () => {
    expect(resolveTurnOverlapIdentity({ sessionKey: ISOLATED_SESSION_KEY })).toBe(
      `key:${SESSION_KEY}`,
    );
    expect(resolveTurnOverlapIdentity({ sessionKey: "agent:main:heartbeat:heartbeat" })).toBe(
      "key:agent:main",
    );
    expect(resolveTurnOverlapIdentity({ sessionKey: SESSION_KEY })).toBe(`key:${SESSION_KEY}`);
    expect(resolveTurnOverlapIdentity({ sessionId: "abc" })).toBe("id:abc");
    expect(resolveTurnOverlapIdentity({})).toBe("unknown");
  });

  it("does not flag sequential turns on the same session", () => {
    const errorSpy = vi.spyOn(diag, "error").mockImplementation(() => {});
    const turnA = beginTurn({ turnId: "turn-a", kind: "user" });
    endDiagnosticAgentTurn(turnA);
    const turnB = beginTurn({ turnId: "turn-b", kind: "heartbeat" });
    endDiagnosticAgentTurn(turnB);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not flag concurrent turns on different sessions", () => {
    const errorSpy = vi.spyOn(diag, "error").mockImplementation(() => {});
    const turnA = beginTurn({ turnId: "turn-a", kind: "user", sessionKey: SESSION_KEY });
    const turnB = beginTurn({
      turnId: "turn-b",
      kind: "heartbeat",
      sessionKey: OTHER_SESSION_KEY,
    });
    expect(errorSpy).not.toHaveBeenCalled();
    endDiagnosticAgentTurn(turnA);
    endDiagnosticAgentTurn(turnB);
  });

  it("flags [turn-overlap] at ERROR with both turn ids and kinds when turns overlap", () => {
    const errorSpy = vi.spyOn(diag, "error").mockImplementation(() => {});
    const turnA = beginTurn({ turnId: "turn-a", kind: "user" });
    const turnB = beginTurn({ turnId: "turn-b", kind: "heartbeat" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = errorSpy.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("[turn-overlap]");
    expect(message).toContain("newTurnId=turn-b");
    expect(message).toContain("newKind=heartbeat");
    expect(message).toContain("activeTurnId=turn-a");
    expect(message).toContain("activeKind=user");
    expect(message).toContain("sessionId=session-turn-b");
    expect(message).toContain(`sessionKey=${SESSION_KEY}`);

    // The newest turn is the tracked active turn.
    expect(getActiveDiagnosticAgentTurn({ sessionKey: SESSION_KEY })?.turnId).toBe("turn-b");

    // Ending the newer turn clears the active entry; the older turn's end
    // journals a superseded line without raising a second alarm.
    endDiagnosticAgentTurn(turnB);
    expect(getActiveDiagnosticAgentTurn({ sessionKey: SESSION_KEY })).toBeUndefined();
    endDiagnosticAgentTurn(turnA);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("flags overlap between an isolated heartbeat turn and the base session turn", () => {
    const errorSpy = vi.spyOn(diag, "error").mockImplementation(() => {});
    const baseTurn = beginTurn({ turnId: "turn-base", kind: "user", sessionKey: SESSION_KEY });
    const isolatedTurn = beginTurn({
      turnId: "turn-iso",
      kind: "heartbeat",
      sessionKey: ISOLATED_SESSION_KEY,
    });

    // The shadow-turn scenario: an isolated heartbeat turn started while the
    // base session's turn was mid-flight.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = errorSpy.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("[turn-overlap]");
    expect(message).toContain("newTurnId=turn-iso");
    expect(message).toContain("activeTurnId=turn-base");

    endDiagnosticAgentTurn(isolatedTurn);
    endDiagnosticAgentTurn(baseTurn);
  });

  it("records last turn start per session and folds isolated heartbeat refs onto the base", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const baseTurn = beginTurn({ turnId: "turn-base", kind: "user", sessionKey: SESSION_KEY });
      expect(getLastDiagnosticAgentTurnStartedAt({ sessionKey: SESSION_KEY })).toBe(1_000_000);
      endDiagnosticAgentTurn(baseTurn);

      vi.setSystemTime(2_000_000);
      const isolatedTurn = beginTurn({
        turnId: "turn-iso",
        kind: "heartbeat",
        sessionKey: ISOLATED_SESSION_KEY,
      });
      // The isolated turn counts as activity for the base session (watchdog anchor).
      expect(getLastDiagnosticAgentTurnStartedAt({ sessionKey: SESSION_KEY })).toBe(2_000_000);
      expect(getLastDiagnosticAgentTurnStartedAt({ sessionKey: ISOLATED_SESSION_KEY })).toBe(
        2_000_000,
      );
      expect(
        getLastDiagnosticAgentTurnStartedAt({ sessionKey: OTHER_SESSION_KEY }),
      ).toBeUndefined();
      endDiagnosticAgentTurn(isolatedTurn);
    } finally {
      vi.useRealTimers();
    }
  });

  it("detects overlap through a fake session lane that fails to serialize (concurrency 2)", async () => {
    // The real session lanes default to maxConcurrent=1, which serializes same
    // session turns. This test simulates the failure mode the detector exists
    // for: a lane configured (or raced) to run two tasks concurrently — e.g.
    // two wake-handler invocations dispatching turns on one session.
    const errorSpy = vi.spyOn(diag, "error").mockImplementation(() => {});
    const lane = `session:${SESSION_KEY}`;
    setCommandLaneConcurrency(lane, 2);
    try {
      const turnIds: string[] = [];
      // Both lane tasks stay pending until both turns have begun — genuine
      // concurrent turns inside the lane.
      const allTurnsBegan = new Promise<void>((resolve) => {
        (globalThis as { __resolveAllTurnsBegan?: () => void }).__resolveAllTurnsBegan = () => {
          if (turnIds.length >= 2) {
            resolve();
          }
        };
      });

      const runTurnTask = (turnId: string) => {
        const token = beginTurn({ turnId, kind: "user" });
        turnIds.push(turnId);
        (globalThis as { __resolveAllTurnsBegan?: () => void }).__resolveAllTurnsBegan?.();
        return allTurnsBegan.then(() => {
          endDiagnosticAgentTurn(token);
        });
      };

      await Promise.all([
        enqueueCommandInLane(lane, () => runTurnTask("lane-turn-1")),
        enqueueCommandInLane(lane, () => runTurnTask("lane-turn-2")),
      ]);

      expect(turnIds).toEqual(["lane-turn-1", "lane-turn-2"]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[0]).toContain("[turn-overlap]");
      expect(errorSpy.mock.calls[0]?.[0]).toContain("newTurnId=lane-turn-2");
      expect(errorSpy.mock.calls[0]?.[0]).toContain("activeTurnId=lane-turn-1");
    } finally {
      delete (globalThis as { __resolveAllTurnsBegan?: () => void }).__resolveAllTurnsBegan;
      setCommandLaneConcurrency(lane, 1);
      resetCommandQueueStateForTest();
    }
  });

  it("maps embedded run triggers to turn kinds", () => {
    const debugSpy = vi.spyOn(diag, "debug").mockImplementation(() => {});
    const cronTurn = beginDiagnosticAgentTurn({
      turnId: "cron-1",
      trigger: "cron",
      sessionKey: OTHER_SESSION_KEY,
    });
    expect(debugSpy).toHaveBeenCalled();
    const logged = debugSpy.mock.calls[0]?.[0] ?? "";
    expect(logged).toContain("[turn-start]");
    expect(logged).toContain("kind=cron");
    endDiagnosticAgentTurn(cronTurn);

    debugSpy.mockClear();
    const heartbeatTurn = beginDiagnosticAgentTurn({
      turnId: "hb-1",
      trigger: "heartbeat",
      sessionKey: OTHER_SESSION_KEY,
    });
    expect(debugSpy.mock.calls[0]?.[0] ?? "").toContain("kind=heartbeat");
    endDiagnosticAgentTurn(heartbeatTurn);
  });

  it("journals [turn-end] with duration for a completed turn", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const debugSpy = vi.spyOn(diag, "debug").mockImplementation(() => {});
      const token = beginTurn({ turnId: "turn-a", kind: "user" });
      debugSpy.mockClear();
      vi.setSystemTime(1_005_000);
      endDiagnosticAgentTurn(token);
      const endLog = debugSpy.mock.calls
        .map((call) => call[0] ?? "")
        .find((line) => line.includes("[turn-end]"));
      expect(endLog).toBeDefined();
      expect(endLog).toContain("turnId=turn-a");
      expect(endLog).toContain("durationMs=5000");
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts a stale active turn instead of flagging overlap forever (item-17)", () => {
    vi.useFakeTimers();
    try {
      const errorSpy = vi.spyOn(diag, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(diag, "warn").mockImplementation(() => {});
      // A turn begins but never ends (crashed/hung run).
      vi.setSystemTime(1_000_000);
      beginTurn({ turnId: "ghost-turn", kind: "heartbeat" });
      // A fresh turn starts after the staleness limit: the ghost is evicted
      // with a warn, not treated as a live overlap.
      vi.setSystemTime(1_000_000 + 61 * 60_000);
      const token = beginTurn({ turnId: "fresh-turn", kind: "heartbeat" });
      expect(warnSpy.mock.calls.some((call) => (call[0] ?? "").includes("[turn-stale-evicted]")))
        .toBe(true);
      expect(
        errorSpy.mock.calls.some((call) => (call[0] ?? "").includes("[turn-overlap]")),
      ).toBe(false);
      expect(getActiveDiagnosticAgentTurn({ sessionKey: SESSION_KEY })?.turnId).toBe(
        "fresh-turn",
      );
      endDiagnosticAgentTurn(token);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still flags overlap for a turn that is genuinely live (within staleness limit)", () => {
    vi.useFakeTimers();
    try {
      const errorSpy = vi.spyOn(diag, "error").mockImplementation(() => {});
      vi.setSystemTime(1_000_000);
      beginTurn({ turnId: "live-turn", kind: "user" });
      vi.setSystemTime(1_000_000 + 5 * 60_000);
      const token = beginTurn({ turnId: "racing-turn", kind: "heartbeat" });
      expect(
        errorSpy.mock.calls.some((call) => (call[0] ?? "").includes("[turn-overlap]")),
      ).toBe(true);
      endDiagnosticAgentTurn(token);
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters last-turn-started lookups by kind so user turns cannot mask a dead wake path (item-17)", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const userToken = beginTurn({ turnId: "user-1", kind: "user" });
      vi.setSystemTime(1_000_000 + 60_000);
      const heartbeatToken = beginTurn({ turnId: "hb-1", kind: "heartbeat" });
      endDiagnosticAgentTurn(userToken);
      endDiagnosticAgentTurn(heartbeatToken);
      const anyKind = getLastDiagnosticAgentTurnStartedAt({ sessionKey: SESSION_KEY });
      const heartbeatOnly = getLastDiagnosticAgentTurnStartedAt(
        { sessionKey: SESSION_KEY },
        ["heartbeat"],
      );
      expect(anyKind).toBe(1_000_000 + 60_000);
      expect(heartbeatOnly).toBe(1_000_000 + 60_000);
      // Now a user turn refreshes the unfiltered anchor but not the wake-path
      // anchor — the watchdog filter keeps seeing the stale heartbeat.
      vi.setSystemTime(1_000_000 + 120_000);
      const userToken2 = beginTurn({ turnId: "user-2", kind: "user" });
      endDiagnosticAgentTurn(userToken2);
      expect(getLastDiagnosticAgentTurnStartedAt({ sessionKey: SESSION_KEY })).toBe(
        1_000_000 + 120_000,
      );
      expect(
        getLastDiagnosticAgentTurnStartedAt({ sessionKey: SESSION_KEY }, ["heartbeat"]),
      ).toBe(1_000_000 + 60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("detects overlap through sibling identities via the symmetric begin() resolution (item-17)", () => {
    const errorSpy = vi.spyOn(diag, "error").mockImplementation(() => {});
    // Registered under a session id identity (no sessionKey)...
    beginDiagnosticAgentTurn({
      turnId: "id-turn",
      kind: "user",
      sessionId: "session-shared",
    });
    // ...looked up by sessionKey: begin() must still see it as the active turn
    // for the same session and raise the overlap alarm.
    const token = beginDiagnosticAgentTurn({
      turnId: "key-turn",
      kind: "heartbeat",
      sessionKey: SESSION_KEY,
      sessionId: "session-shared",
    });
    expect(
      errorSpy.mock.calls.some(
        (call) => (call[0] ?? "").includes("[turn-overlap]") && (call[0] ?? "").includes("id-turn"),
      ),
    ).toBe(true);
    endDiagnosticAgentTurn(token);
  });

  it("still registers the new turn when the overlap alarm emission throws (item-17b emission ordering)", () => {
    vi.spyOn(diag, "error").mockImplementation(() => {
      throw new Error("emission explosion");
    });
    beginTurn({ turnId: "turn-a", kind: "user" });
    // Overlap: turn-b begins while turn-a is live and the alarm emission throws.
    const turnB = beginTurn({ turnId: "turn-b", kind: "heartbeat" });
    // The turn must still be registered and the watchdog anchor refreshed —
    // an emission failure must not disarm the stall detector (the exact
    // failure mode the ocr review flagged for item-17b).
    expect(getActiveDiagnosticAgentTurn({ sessionKey: SESSION_KEY })?.turnId).toBe("turn-b");
    expect(
      getLastDiagnosticAgentTurnStartedAt({ sessionKey: SESSION_KEY }, ["heartbeat"]),
    ).toBeDefined();
    endDiagnosticAgentTurn(turnB);
  });

  it("still registers the new turn when the stale-eviction emission throws (item-17b emission ordering)", () => {
    const warnSpy = vi.spyOn(diag, "warn").mockImplementation(() => {
      throw new Error("warn emission explosion");
    });
    // Seed a ghost turn older than the staleness limit by starting it, then
    // rewinding its startedAt through the active map.
    beginTurn({ turnId: "ghost-turn", kind: "user" });
    const state = (
      globalThis as unknown as {
        [key: symbol]: { activeByIdentity: Map<string, { startedAt: number }> };
      }
    )[Symbol.for("GreenchClaw.diagnosticTurnTracker")];
    for (const turn of state.activeByIdentity.values()) {
      turn.startedAt = Date.now() - 61 * 60_000;
    }
    const fresh = beginTurn({ turnId: "fresh-turn", kind: "heartbeat" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Registration survived the throwing stale-eviction warn.
    expect(getActiveDiagnosticAgentTurn({ sessionKey: SESSION_KEY })?.turnId).toBe("fresh-turn");
    expect(
      getLastDiagnosticAgentTurnStartedAt({ sessionKey: SESSION_KEY }, ["heartbeat"]),
    ).toBeDefined();
    endDiagnosticAgentTurn(fresh);
  });

  it("prunes least-recently-updated refs, not oldest-inserted (item-17b Map LRU fix)", () => {
    const beginRef = (key: string) =>
      beginDiagnosticAgentTurn({ turnId: `t-${key}`, kind: "user", sessionKey: key });
    // Fill the ref ring to its bound: one refKey per distinct session key.
    for (let idx = 0; idx < 512; idx += 1) {
      const token = beginRef(`sess-${idx}`);
      endDiagnosticAgentTurn(token);
    }
    // Refresh the very first ref — with true LRU it becomes the most recent.
    const refreshed = beginRef("sess-0");
    endDiagnosticAgentTurn(refreshed);
    // One more ref pushes the ring over the bound; the prune must evict the
    // least-recently-UPDATED ref (sess-1), not the refreshed sess-0. Under
    // the old FIFO prune, sess-0 kept its original insertion position and
    // was evicted first — losing the heartbeat anchor the watchdog needs.
    beginRef("extra-ref");
    expect(getLastDiagnosticAgentTurnStartedAt({ sessionKey: "sess-0" })).toBeDefined();
    expect(getLastDiagnosticAgentTurnStartedAt({ sessionKey: "sess-1" })).toBeUndefined();
    expect(getLastDiagnosticAgentTurnStartedAt({ sessionKey: "extra-ref" })).toBeDefined();
  });
});
