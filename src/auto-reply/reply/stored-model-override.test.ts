import { describe, expect, it, vi } from "vitest";
import {
  isStaleAutoModelOverrideAcrossRestart,
  resolveProcessStartEpochMs,
  resolveStoredModelOverride,
  type StoredModelOverride,
} from "./stored-model-override.js";

vi.mock("../../channels/plugins/session-conversation.js", () => ({
  resolveSessionParentSessionKey: (sessionKey?: string) =>
    sessionKey?.replace(/:thread:[^:]+$/, "").replace(/:topic:[^:]+$/, "") ?? null,
}));

const SESSION_ENTRY_BASE = {
  sessionId: "session-id",
  updatedAt: 1,
} as const;

function makeStoredOverride(overrides: Partial<StoredModelOverride> = {}): StoredModelOverride {
  return {
    provider: "ollama-local",
    model: "lfm2.5-2.6b",
    source: "session",
    ...overrides,
  };
}

describe("resolveProcessStartEpochMs", () => {
  it("computes process start from uptime without exceeding now", () => {
    const now = 1_700_000_000_000;
    const processStart = resolveProcessStartEpochMs(now);
    expect(processStart).toBeLessThanOrEqual(now);
    expect(processStart).toBeGreaterThan(now - 24 * 60 * 60 * 1000);
  });
});

describe("isStaleAutoModelOverrideAcrossRestart", () => {
  it("marks an auto override last written before the current process started as stale", () => {
    const processStart = 1_700_000_000_000;
    const result = isStaleAutoModelOverrideAcrossRestart({
      storedOverride: makeStoredOverride({
        modelOverrideSource: "auto",
        entryUpdatedAt: processStart - 60_000,
      }),
      processStartEpochMs: processStart,
    });
    expect(result).toBe(true);
  });

  it("keeps an auto override written during the current process lifetime", () => {
    const processStart = 1_700_000_000_000;
    const result = isStaleAutoModelOverrideAcrossRestart({
      storedOverride: makeStoredOverride({
        modelOverrideSource: "auto",
        entryUpdatedAt: processStart + 60_000,
      }),
      processStartEpochMs: processStart,
    });
    expect(result).toBe(false);
  });

  it("keeps user-driven overrides even when written before the process started", () => {
    const processStart = 1_700_000_000_000;
    const result = isStaleAutoModelOverrideAcrossRestart({
      storedOverride: makeStoredOverride({
        modelOverrideSource: "user",
        entryUpdatedAt: processStart - 60_000,
      }),
      processStartEpochMs: processStart,
    });
    expect(result).toBe(false);
  });

  it("keeps legacy overrides without a modelOverrideSource", () => {
    const processStart = 1_700_000_000_000;
    const result = isStaleAutoModelOverrideAcrossRestart({
      storedOverride: makeStoredOverride({
        modelOverrideSource: undefined,
        entryUpdatedAt: processStart - 60_000,
      }),
      processStartEpochMs: processStart,
    });
    expect(result).toBe(false);
  });

  it("is not stale when the entry has no timestamp to date the override", () => {
    const processStart = 1_700_000_000_000;
    const result = isStaleAutoModelOverrideAcrossRestart({
      storedOverride: makeStoredOverride({
        modelOverrideSource: "auto",
        entryUpdatedAt: undefined,
      }),
      processStartEpochMs: processStart,
    });
    expect(result).toBe(false);
  });

  it("returns false when there is no stored override", () => {
    expect(
      isStaleAutoModelOverrideAcrossRestart({
        storedOverride: null,
        processStartEpochMs: 1_700_000_000_000,
      }),
    ).toBe(false);
  });

  it("defaults to the real process start when not overridden", () => {
    // The entry is dated one minute before the actual vitest process start.
    const result = isStaleAutoModelOverrideAcrossRestart({
      storedOverride: makeStoredOverride({
        modelOverrideSource: "auto",
        entryUpdatedAt: resolveProcessStartEpochMs() - 60_000,
      }),
    });
    expect(result).toBe(true);
  });
});

describe("resolveStoredModelOverride metadata annotation", () => {
  it("annotates the session override with source and entry timestamps", () => {
    const override = resolveStoredModelOverride({
      sessionEntry: {
        ...SESSION_ENTRY_BASE,
        providerOverride: "ollama-local",
        modelOverride: "lfm2.5-2.6b",
        modelOverrideSource: "auto",
        updatedAt: 123,
      },
      defaultProvider: "ollama",
    });
    expect(override).not.toBeNull();
    expect(override?.source).toBe("session");
    expect(override?.modelOverrideSource).toBe("auto");
    expect(override?.entryUpdatedAt).toBe(123);
  });

  it("annotates the parent override with the parent entry's metadata", () => {
    const parentKey = "agent:main:discord:channel:c1";
    const sessionKey = "agent:main:discord:channel:c1:thread:123";
    const override = resolveStoredModelOverride({
      sessionEntry: { ...SESSION_ENTRY_BASE },
      sessionStore: {
        [parentKey]: {
          ...SESSION_ENTRY_BASE,
          providerOverride: "ollama-local",
          modelOverride: "lfm2.5-2.6b",
          modelOverrideSource: "auto",
          updatedAt: 456,
        },
      },
      sessionKey,
      defaultProvider: "ollama",
    });
    expect(override).not.toBeNull();
    expect(override?.source).toBe("parent");
    expect(override?.modelOverrideSource).toBe("auto");
    expect(override?.entryUpdatedAt).toBe(456);
  });
});