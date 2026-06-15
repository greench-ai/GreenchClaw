import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGreenchClawTestInstance } from "./GreenchClaw-test-instance.js";

async function expectPathMissing(targetPath: string): Promise<void> {
  try {
    await fs.stat(targetPath);
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
    return;
  }
  throw new Error(`Expected missing path: ${targetPath}`);
}

describe("GreenchClaw test instance", () => {
  it("creates isolated config and spawn env without mutating process env", async () => {
    const previousHome = process.env.HOME;
    const inst = await createGreenchClawTestInstance({
      name: "instance-unit",
      gatewayToken: "gateway-token",
      hookToken: "hook-token",
      config: {
        gateway: {
          bind: "loopback",
        },
      },
      env: {
        GREENCHCLAW_SKIP_CRON: "0",
      },
    });

    try {
      expect(process.env.HOME).toBe(previousHome);
      expect(inst.homeDir).toBe(path.join(inst.state.root, "home"));
      expect(inst.stateDir).toBe(path.join(inst.homeDir, ".GreenchClaw"));
      expect(inst.configPath).toBe(path.join(inst.stateDir, "GreenchClaw.json"));
      expect(inst.env.HOME).toBe(inst.homeDir);
      expect(inst.env.GREENCHCLAW_STATE_DIR).toBe(inst.stateDir);
      expect(inst.env.GREENCHCLAW_CONFIG_PATH).toBe(inst.configPath);
      expect(inst.env.GREENCHCLAW_SKIP_CRON).toBe("0");

      const config = JSON.parse(await fs.readFile(inst.configPath, "utf8"));
      expect(config).toStrictEqual({
        gateway: {
          bind: "loopback",
          port: inst.port,
          auth: {
            mode: "token",
            token: "gateway-token",
          },
          controlUi: {
            enabled: false,
          },
        },
        hooks: {
          enabled: true,
          token: "hook-token",
          path: "/hooks",
        },
      });
    } finally {
      await inst.cleanup();
    }

    await expectPathMissing(inst.state.root);
  });
});
