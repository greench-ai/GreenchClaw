import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetLegacyGreenchClawEnvWarningForTest,
  warnLegacyGreenchClawEnvVars,
} from "./env-deprecation.js";

describe("warnLegacyGreenchClawEnvVars", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVitest = process.env.VITEST;
  let emitWarning: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetLegacyGreenchClawEnvWarningForTest();
    emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
  });

  afterEach(() => {
    emitWarning.mockRestore();
    resetLegacyGreenchClawEnvWarningForTest();
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("VITEST", originalVitest);
  });

  it("warns with counts and prefixes instead of secret-shaped env names", () => {
    warnLegacyGreenchClawEnvVars({
      CLAWDBOT_GATEWAY_TOKEN: "old-token",
      MOLTBOT_GATEWAY_PASSWORD: "old-password", // pragma: allowlist secret
      "CLAWDBOT_MALICIOUS\nforged": "old-value",
    });

    expect(emitWarning).toHaveBeenCalledOnce();
    const [message, options] = emitWarning.mock.calls.at(0) as [
      string,
      { code: string; type: string },
    ];
    expect(message).toContain("Legacy CLAWDBOT_*, MOLTBOT_* environment variables");
    expect(message).toContain("3 total");
    expect(message).toContain("replacing the legacy prefix with GREENCHCLAW_");
    expect(message).not.toContain("GATEWAY_TOKEN");
    expect(message).not.toContain("GATEWAY_PASSWORD");
    expect(message).not.toContain("forged");
    expect(options).toEqual({
      code: "GREENCHCLAW_LEGACY_ENV_VARS",
      type: "DeprecationWarning",
    });
  });

  it("does not warn for current OPENCLAW names", () => {
    warnLegacyGreenchClawEnvVars({ GREENCHCLAW_GATEWAY_TOKEN: "token" });

    expect(emitWarning).not.toHaveBeenCalled();
  });

  it("warns only once after a successful emit", () => {
    warnLegacyGreenchClawEnvVars({ CLAWDBOT_GATEWAY_TOKEN: "old-token" });
    warnLegacyGreenchClawEnvVars({ MOLTBOT_GATEWAY_TOKEN: "old-token" });

    expect(emitWarning).toHaveBeenCalledOnce();
  });

  it("retries if emitWarning throws before the warning is emitted", () => {
    emitWarning
      .mockImplementationOnce(() => {
        throw new Error("warning sink failed");
      })
      .mockImplementationOnce(() => {});

    expect(() => warnLegacyGreenchClawEnvVars({ CLAWDBOT_GATEWAY_TOKEN: "old-token" })).toThrow(
      "warning sink failed",
    );
    warnLegacyGreenchClawEnvVars({ CLAWDBOT_GATEWAY_TOKEN: "old-token" });

    expect(emitWarning).toHaveBeenCalledTimes(2);
  });

  it("suppresses warning noise based on the passed env", () => {
    warnLegacyGreenchClawEnvVars({
      CLAWDBOT_GATEWAY_TOKEN: "old-token",
      VITEST: "true",
    });

    expect(emitWarning).not.toHaveBeenCalled();
  });

  it("does not let process.env test flags suppress a synthetic env", () => {
    process.env.VITEST = "true";

    warnLegacyGreenchClawEnvVars({ CLAWDBOT_GATEWAY_TOKEN: "old-token" });

    expect(emitWarning).toHaveBeenCalledOnce();
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
