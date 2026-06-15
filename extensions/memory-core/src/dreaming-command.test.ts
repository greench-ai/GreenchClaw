import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import type {
  GreenchClawPluginCommandDefinition,
  PluginCommandContext,
} from "GreenchClaw/plugin-sdk/core";
import type { GreenchClawPluginApi } from "GreenchClaw/plugin-sdk/plugin-entry";
import { describe, expect, it, vi } from "vitest";
import { registerDreamingCommand } from "./dreaming-command.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function resolveStoredDreaming(config: GreenchClawConfig): Record<string, unknown> {
  const entry = asRecord(config.plugins?.entries?.["memory-core"]);
  const pluginConfig = asRecord(entry?.config);
  return asRecord(pluginConfig?.dreaming) ?? {};
}

function createHarness(initialConfig: GreenchClawConfig = {}) {
  const registered: { command?: GreenchClawPluginCommandDefinition } = {};
  let runtimeConfig: GreenchClawConfig = initialConfig;

  const runtime = {
    config: {
      current: vi.fn(() => runtimeConfig),
      loadConfig: vi.fn(() => runtimeConfig),
      replaceConfigFile: vi.fn(async ({ nextConfig }: { nextConfig: GreenchClawConfig }) => {
        runtimeConfig = nextConfig;
      }),
      writeConfigFile: vi.fn(async (nextConfig: GreenchClawConfig) => {
        runtimeConfig = nextConfig;
      }),
    },
  } as unknown as GreenchClawPluginApi["runtime"];

  const api = {
    runtime,
    registerCommand: vi.fn((definition: GreenchClawPluginCommandDefinition) => {
      registered.command = definition;
    }),
  } as unknown as GreenchClawPluginApi;

  registerDreamingCommand(api);

  if (!registered.command) {
    throw new Error("memory-core did not register /dreaming");
  }

  return {
    command: registered.command,
    runtime,
    getRuntimeConfig: () => runtimeConfig,
  };
}

function createCommandContext(
  args?: string,
  overrides?: Partial<Pick<PluginCommandContext, "gatewayClientScopes">>,
): PluginCommandContext {
  return {
    channel: "webchat",
    isAuthorizedSender: true,
    commandBody: args ? `/dreaming ${args}` : "/dreaming",
    args,
    config: {},
    gatewayClientScopes: overrides?.gatewayClientScopes,
    requestConversationBinding: async () => ({ status: "error", message: "unsupported" }),
    detachConversationBinding: async () => ({ removed: false }),
    getCurrentConversationBinding: async () => null,
  };
}

describe("memory-core /dreaming command", () => {
  it("registers with an enable/disable description", () => {
    const { command } = createHarness();
    expect(command.name).toBe("dreaming");
    expect(command.acceptsArgs).toBe(true);
    expect(command.description).toContain("Enable or disable");
  });

  it("shows phase explanations when invoked without args", async () => {
    const { command } = createHarness();
    const result = await command.handler(createCommandContext());

    expect(result.text).toContain("Usage: /dreaming status");
    expect(result.text).toContain("Dreaming status:");
    expect(result.text).toContain("- implementation detail: each sweep runs light -> REM -> deep.");
    expect(result.text).toContain(
      "- deep is the only stage that writes durable entries to MEMORY.md.",
    );
  });

  it("persists global enablement under plugins.entries.memory-core.config.dreaming.enabled", async () => {
    const { command, runtime, getRuntimeConfig } = createHarness({
      plugins: {
        entries: {
          "memory-core": {
            config: {
              dreaming: {
                phases: {
                  deep: {
                    minScore: 0.9,
                  },
                },
                frequency: "0 */6 * * *",
              },
            },
          },
        },
      },
    });

    const result = await command.handler(createCommandContext("off"));

    expect(runtime.config.replaceConfigFile).toHaveBeenCalledTimes(1);
    const storedDreaming = resolveStoredDreaming(getRuntimeConfig());
    expect(storedDreaming.enabled).toBe(false);
    expect(storedDreaming.frequency).toBe("0 */6 * * *");
    expect(result.text).toContain("Dreaming disabled.");
  });

  it("blocks unscoped gateway callers from persisting dreaming config", async () => {
    const { command, runtime } = createHarness();

    const result = await command.handler(
      createCommandContext("off", {
        gatewayClientScopes: [],
      }),
    );

    expect(result.text).toContain("requires operator.admin");
    expect(runtime.config.replaceConfigFile).not.toHaveBeenCalled();
  });

  it("blocks write-scoped gateway callers from persisting dreaming config", async () => {
    const { command, runtime } = createHarness();

    const result = await command.handler(
      createCommandContext("off", {
        gatewayClientScopes: ["operator.write"],
      }),
    );

    expect(result.text).toContain("requires operator.admin");
    expect(runtime.config.replaceConfigFile).not.toHaveBeenCalled();
  });

  it("allows admin-scoped gateway callers to persist dreaming config", async () => {
    const { command, runtime, getRuntimeConfig } = createHarness();

    const result = await command.handler(
      createCommandContext("on", {
        gatewayClientScopes: ["operator.admin"],
      }),
    );

    expect(runtime.config.replaceConfigFile).toHaveBeenCalledTimes(1);
    expect(resolveStoredDreaming(getRuntimeConfig()).enabled).toBe(true);
    expect(result.text).toContain("Dreaming enabled.");
  });

  it("returns status without mutating config", async () => {
    const { command, runtime } = createHarness({
      plugins: {
        entries: {
          "memory-core": {
            config: {
              dreaming: {
                frequency: "15 */8 * * *",
              },
            },
          },
        },
      },
      agents: {
        defaults: {
          userTimezone: "America/Los_Angeles",
        },
      },
    });

    const result = await command.handler(createCommandContext("status"));

    expect(result.text).toContain("Dreaming status:");
    expect(result.text).toContain("- enabled: off (America/Los_Angeles)");
    expect(result.text).toContain("- sweep cadence: 15 */8 * * *");
    expect(result.text).toContain("- promotion policy: score>=0.8, recalls>=3, uniqueQueries>=3");
    expect(runtime.config.replaceConfigFile).not.toHaveBeenCalled();
  });

  it("shows usage for invalid args and does not mutate config", async () => {
    const { command, runtime } = createHarness();
    const result = await command.handler(createCommandContext("unknown-mode"));

    expect(result.text).toContain("Usage: /dreaming status");
    expect(runtime.config.replaceConfigFile).not.toHaveBeenCalled();
  });
});
