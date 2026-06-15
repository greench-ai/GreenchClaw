import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          GREENCHCLAW_STATE_DIR: "/tmp/GreenchClaw-state",
          GREENCHCLAW_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "GreenchClaw-gateway",
        windowsTaskName: "GreenchClaw Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/GreenchClaw-state/logs/gateway.log",
      "Launchd stderr (if installed): suppressed",
      "Restart attempts: /tmp/GreenchClaw-state/logs/gateway-restart.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        env: {
          GREENCHCLAW_STATE_DIR: "/tmp/GreenchClaw-state",
        },
        systemdServiceName: "GreenchClaw-gateway",
        windowsTaskName: "GreenchClaw Gateway",
      }),
    ).toEqual([
      "Logs: journalctl --user -u GreenchClaw-gateway.service -n 200 --no-pager",
      "Restart attempts: /tmp/GreenchClaw-state/logs/gateway-restart.log",
    ]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        env: {
          GREENCHCLAW_STATE_DIR: "/tmp/GreenchClaw-state",
        },
        systemdServiceName: "GreenchClaw-gateway",
        windowsTaskName: "GreenchClaw Gateway",
      }),
    ).toEqual([
      'Logs: schtasks /Query /TN "GreenchClaw Gateway" /V /FO LIST',
      "Restart attempts: /tmp/GreenchClaw-state/logs/gateway-restart.log",
    ]);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "GreenchClaw gateway install",
        startCommand: "GreenchClaw gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.GreenchClaw.gateway.plist",
        systemdServiceName: "GreenchClaw-gateway",
        windowsTaskName: "GreenchClaw Gateway",
      }),
    ).toEqual([
      "GreenchClaw gateway install",
      "GreenchClaw gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.GreenchClaw.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "GreenchClaw gateway install",
        startCommand: "GreenchClaw gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.GreenchClaw.gateway.plist",
        systemdServiceName: "GreenchClaw-gateway",
        windowsTaskName: "GreenchClaw Gateway",
      }),
    ).toEqual([
      "GreenchClaw gateway install",
      "GreenchClaw gateway",
      "systemctl --user start GreenchClaw-gateway.service",
    ]);
  });
});
