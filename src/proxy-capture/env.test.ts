import { describe, expect, it } from "vitest";
import {
  GREENCHCLAW_DEBUG_PROXY_ENABLED,
  GREENCHCLAW_DEBUG_PROXY_SESSION_ID,
  resolveDebugProxySettings,
} from "./env.js";

describe("resolveDebugProxySettings", () => {
  it("keeps an implicit debug proxy session id stable within one process", () => {
    const env = {
      [GREENCHCLAW_DEBUG_PROXY_ENABLED]: "1",
    } satisfies NodeJS.ProcessEnv;

    const first = resolveDebugProxySettings(env);
    const second = resolveDebugProxySettings(env);

    expect(first.sessionId).toBe(second.sessionId);
  });

  it("prefers an explicit session id from the environment", () => {
    const settings = resolveDebugProxySettings({
      [GREENCHCLAW_DEBUG_PROXY_ENABLED]: "1",
      [GREENCHCLAW_DEBUG_PROXY_SESSION_ID]: "session-explicit",
    });

    expect(settings.sessionId).toBe("session-explicit");
  });
});
