import { describe, expect, it } from "vitest";
import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import { collectConfiguredAgentHarnessRuntimes } from "./harness-runtimes.js";

describe("collectConfiguredAgentHarnessRuntimes", () => {
  it("ignores malformed agents.list while scanning best-effort config", () => {
    const config = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-opus-4-6": {
              agentRuntime: { id: "claude" },
            },
          },
        },
        list: {
          ops: {
            id: "ops",
            agentRuntime: { id: "codex" },
          },
        },
      },
    } as unknown as GreenchClawConfig;

    expect(collectConfiguredAgentHarnessRuntimes(config, {}, { includeEnvRuntime: false })).toEqual(
      ["claude"],
    );
  });
});
