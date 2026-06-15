import { beforeAll, describe, expect, it, vi } from "vitest";

const resolveGatewayLogPathsMock = vi.fn(() => ({
  logDir: "C:\\tmp\\GreenchClaw-state\\logs",
  stdoutPath: "C:\\tmp\\GreenchClaw-state\\logs\\gateway.log",
  stderrPath: "C:\\tmp\\GreenchClaw-state\\logs\\gateway.err.log",
}));
const resolveGatewayRestartLogPathMock = vi.fn(
  () => "C:\\tmp\\GreenchClaw-state\\logs\\gateway-restart.log",
);

vi.mock("./restart-logs.js", () => ({
  resolveGatewayLogPaths: resolveGatewayLogPathsMock,
  resolveGatewayRestartLogPath: resolveGatewayRestartLogPathMock,
}));

let buildPlatformRuntimeLogHints: typeof import("./runtime-hints.js").buildPlatformRuntimeLogHints;

describe("buildPlatformRuntimeLogHints", () => {
  beforeAll(async () => {
    ({ buildPlatformRuntimeLogHints } = await import("./runtime-hints.js"));
  });

  it("strips windows drive prefixes from darwin display paths", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        systemdServiceName: "GreenchClaw-gateway",
        windowsTaskName: "GreenchClaw Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/GreenchClaw-state/logs/gateway.log",
      "Launchd stderr (if installed): suppressed",
      "Restart attempts: /tmp/GreenchClaw-state/logs/gateway-restart.log",
    ]);
  });
});
