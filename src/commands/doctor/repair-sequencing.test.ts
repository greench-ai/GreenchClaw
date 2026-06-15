import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GreenchClawConfig } from "../../config/config.js";
import { runDoctorRepairSequence } from "./repair-sequencing.js";

const mocks = vi.hoisted(() => ({
  applyPluginAutoEnable: vi.fn(),
  ensureAuthProfileStore: vi.fn(),
  evaluateStoredCredentialEligibility: vi.fn(),
  getInstalledPluginRecord: vi.fn(),
  isInstalledPluginEnabled: vi.fn(),
  loadInstalledPluginIndex: vi.fn(),
  maybeRepairManagedNpmGreenchClawPeerLinks: vi.fn(),
  maybeRepairStaleManagedNpmBundledPlugins: vi.fn(),
  maybeRepairStalePluginConfig: vi.fn(),
  repairMissingConfiguredPluginInstalls: vi.fn(),
  resolveAuthProfileOrder: vi.fn(),
  resolveProfileUnusableUntilForDisplay: vi.fn(),
}));

vi.mock("../../config/plugin-auto-enable.js", () => ({
  applyPluginAutoEnable: mocks.applyPluginAutoEnable,
}));

vi.mock("../doctor-plugin-registry.js", () => ({
  maybeRepairManagedNpmGreenchClawPeerLinks: mocks.maybeRepairManagedNpmGreenchClawPeerLinks,
  maybeRepairStaleManagedNpmBundledPlugins: mocks.maybeRepairStaleManagedNpmBundledPlugins,
}));

vi.mock("./shared/missing-configured-plugin-install.js", () => ({
  repairMissingConfiguredPluginInstalls: mocks.repairMissingConfiguredPluginInstalls,
}));

vi.mock("../../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: mocks.ensureAuthProfileStore,
  resolveAuthProfileOrder: mocks.resolveAuthProfileOrder,
  resolveProfileUnusableUntilForDisplay: mocks.resolveProfileUnusableUntilForDisplay,
}));

vi.mock("../../agents/auth-profiles/credential-state.js", () => ({
  evaluateStoredCredentialEligibility: mocks.evaluateStoredCredentialEligibility,
}));

vi.mock("../../plugins/installed-plugin-index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../plugins/installed-plugin-index.js")>()),
  getInstalledPluginRecord: mocks.getInstalledPluginRecord,
  isInstalledPluginEnabled: mocks.isInstalledPluginEnabled,
  loadInstalledPluginIndex: mocks.loadInstalledPluginIndex,
}));

vi.mock("./shared/channel-doctor.js", () => ({
  collectChannelDoctorRepairMutations: ({ cfg }: { cfg: GreenchClawConfig }) => {
    const allowFrom = cfg.channels?.discord?.allowFrom as unknown[] | undefined;
    if (allowFrom?.[0] === 123) {
      return [
        {
          config: {
            ...cfg,
            channels: {
              ...cfg.channels,
              discord: {
                ...cfg.channels?.discord,
                allowFrom: ["123"],
              },
            },
          },
          changes: ["channels.discord.allowFrom: converted 1 numeric ID to strings"],
        },
      ];
    }
    if (allowFrom?.[0] === 106232522769186816) {
      return [
        {
          config: cfg,
          changes: [],
          warnings: [
            "channels.discord.allowFrom[0] cannot be auto-repaired because it is not a safe integer",
          ],
        },
      ];
    }
    return [];
  },
  createChannelDoctorEmptyAllowlistPolicyHooks: () => ({
    extraWarningsForAccount: () => [],
    shouldSkipDefaultEmptyGroupAllowlistWarning: () => false,
  }),
}));

vi.mock("./shared/empty-allowlist-scan.js", () => ({
  scanEmptyAllowlistPolicyWarnings: (cfg: GreenchClawConfig) =>
    cfg.channels?.signal
      ? ["channels.signal.accounts.ops\u001B[31m-team\u001B[0m\r\nnext.dmPolicy warning"]
      : [],
}));

vi.mock("./shared/allowlist-policy-repair.js", () => ({
  maybeRepairAllowlistPolicyAllowFrom: async (cfg: GreenchClawConfig) => ({
    config: cfg,
    changes: [],
  }),
}));

vi.mock("./shared/bundled-plugin-load-paths.js", () => ({
  maybeRepairBundledPluginLoadPaths: (cfg: GreenchClawConfig) => ({
    config: cfg,
    changes: [],
  }),
}));

vi.mock("./shared/open-policy-allowfrom.js", () => ({
  maybeRepairOpenPolicyAllowFrom: (cfg: GreenchClawConfig) => ({
    config: cfg,
    changes: [],
  }),
}));

vi.mock("./shared/stale-plugin-config.js", () => ({
  maybeRepairStalePluginConfig: mocks.maybeRepairStalePluginConfig,
}));

vi.mock("./shared/invalid-plugin-config.js", () => ({
  maybeRepairInvalidPluginConfig: (cfg: GreenchClawConfig) => ({
    config: cfg,
    changes: [],
  }),
}));

vi.mock("./shared/legacy-tools-by-sender.js", () => ({
  maybeRepairLegacyToolsBySenderKeys: (cfg: GreenchClawConfig) => {
    const channels = cfg.channels as Record<string, unknown> | undefined;
    const tools = channels?.tools as
      | { exec?: { toolsBySender?: Record<string, unknown> } }
      | undefined;
    const bySender = tools?.exec?.toolsBySender;
    const rawKey = bySender
      ? Object.keys(bySender).find((key) => !key.startsWith("id:"))
      : undefined;
    if (!bySender || !rawKey) {
      return { config: cfg, changes: [] };
    }
    const targetKey = `id:${rawKey.trim()}`;
    return {
      config: {
        ...cfg,
        channels: {
          ...cfg.channels,
          tools: {
            ...(channels?.tools as Record<string, unknown> | undefined),
            exec: {
              ...tools?.exec,
              toolsBySender: {
                [targetKey]: bySender[rawKey],
              },
            },
          },
        },
      },
      changes: [
        `channels.tools.exec.toolsBySender: migrated 1 legacy key to typed id: entries (${rawKey} -> ${targetKey})`,
      ],
    };
  },
}));

vi.mock("./shared/exec-safe-bins.js", () => ({
  maybeRepairExecSafeBinProfiles: (cfg: GreenchClawConfig) => ({
    config: cfg,
    changes: [],
  }),
}));

describe("doctor repair sequencing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyPluginAutoEnable.mockImplementation((params: { config: GreenchClawConfig }) => ({
      config: params.config,
      changes: [],
    }));
    mocks.ensureAuthProfileStore.mockReturnValue({
      profiles: {},
      usageStats: {},
    });
    mocks.evaluateStoredCredentialEligibility.mockReturnValue({
      eligible: true,
      reasonCode: "ok",
    });
    mocks.getInstalledPluginRecord.mockReturnValue(undefined);
    mocks.isInstalledPluginEnabled.mockReturnValue(false);
    mocks.loadInstalledPluginIndex.mockReturnValue({ plugins: [] });
    mocks.maybeRepairManagedNpmGreenchClawPeerLinks.mockResolvedValue(false);
    mocks.maybeRepairStaleManagedNpmBundledPlugins.mockReturnValue(false);
    mocks.repairMissingConfiguredPluginInstalls.mockResolvedValue({
      changes: [],
      warnings: [],
    });
    mocks.resolveAuthProfileOrder.mockReturnValue([]);
    mocks.resolveProfileUnusableUntilForDisplay.mockReturnValue(null);
    mocks.maybeRepairStalePluginConfig.mockImplementation((cfg: GreenchClawConfig) => ({
      config: cfg,
      changes: [],
    }));
  });

  it("applies ordered repairs and sanitizes empty-allowlist warnings", async () => {
    const result = await runDoctorRepairSequence({
      state: {
        cfg: {
          channels: {
            discord: {
              allowFrom: [123],
            },
            tools: {
              exec: {
                toolsBySender: {
                  "bad\u001B[31m-key\u001B[0m\r\nnext": { enabled: true },
                },
              },
            },
            signal: {
              accounts: {
                "ops\u001B[31m-team\u001B[0m\r\nnext": {
                  dmPolicy: "allowlist",
                },
              },
            },
          },
        } as unknown as GreenchClawConfig,
        candidate: {
          channels: {
            discord: {
              allowFrom: [123],
            },
            tools: {
              exec: {
                toolsBySender: {
                  "bad\u001B[31m-key\u001B[0m\r\nnext": { enabled: true },
                },
              },
            },
            signal: {
              accounts: {
                "ops\u001B[31m-team\u001B[0m\r\nnext": {
                  dmPolicy: "allowlist",
                },
              },
            },
          },
        } as unknown as GreenchClawConfig,
        pendingChanges: false,
        fixHints: [],
      },
      doctorFixCommand: "GreenchClaw doctor --fix",
    });

    expect(result.state.pendingChanges).toBe(true);
    expect(result.state.candidate.channels?.discord?.allowFrom).toEqual(["123"]);
    expect(result.changeNotes).toStrictEqual([
      "channels.discord.allowFrom: converted 1 numeric ID to strings",
      "channels.tools.exec.toolsBySender: migrated 1 legacy key to typed id: entries (bad-keynext -> id:bad-keynext)",
    ]);
    expect(result.changeNotes.join("\n")).not.toContain("\u001B");
    expect(result.changeNotes.join("\n")).not.toContain("\r");
    expect(result.warningNotes).toStrictEqual([
      "channels.signal.accounts.ops-teamnext.dmPolicy warning",
    ]);
    expect(result.warningNotes.join("\n")).not.toContain("\u001B");
    expect(result.warningNotes.join("\n")).not.toContain("\r");
  });

  it("repairs managed npm plugin drift before missing plugin install repair", async () => {
    const events: string[] = [];
    mocks.maybeRepairStaleManagedNpmBundledPlugins.mockImplementation(() => {
      events.push("bundled-shadow-cleanup");
      return true;
    });
    mocks.maybeRepairManagedNpmGreenchClawPeerLinks.mockImplementation(async () => {
      events.push("GreenchClaw-peer-links");
      return true;
    });
    mocks.repairMissingConfiguredPluginInstalls.mockImplementation(async () => {
      events.push("missing-installs");
      return { changes: [], warnings: [] };
    });

    await runDoctorRepairSequence({
      state: {
        cfg: {
          plugins: {
            entries: {
              "google-meet": { enabled: true },
            },
          },
        } as GreenchClawConfig,
        candidate: {
          plugins: {
            entries: {
              "google-meet": { enabled: true },
            },
          },
        } as GreenchClawConfig,
        pendingChanges: false,
        fixHints: [],
      },
      doctorFixCommand: "GreenchClaw doctor --fix",
    });

    expect(events).toEqual([
      "bundled-shadow-cleanup",
      "GreenchClaw-peer-links",
      "missing-installs",
    ]);
    expect(mocks.maybeRepairStaleManagedNpmBundledPlugins).toHaveBeenCalledOnce();
    const cleanupCall = mocks.maybeRepairStaleManagedNpmBundledPlugins.mock.calls.at(0)?.[0];
    expect(cleanupCall?.config.plugins?.entries?.["google-meet"]).toEqual({ enabled: true });
    expect(cleanupCall?.prompter).toEqual({ shouldRepair: true });
    expect(mocks.maybeRepairManagedNpmGreenchClawPeerLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          plugins: expect.objectContaining({
            entries: expect.objectContaining({
              "google-meet": { enabled: true },
            }),
          }),
        }),
        prompter: { shouldRepair: true },
      }),
    );
  });

  it("emits Discord warnings when unsafe numeric ids block repair", async () => {
    const result = await runDoctorRepairSequence({
      state: {
        cfg: {
          channels: {
            discord: {
              allowFrom: [106232522769186816],
            },
          },
        } as unknown as GreenchClawConfig,
        candidate: {
          channels: {
            discord: {
              allowFrom: [106232522769186816],
            },
          },
        } as unknown as GreenchClawConfig,
        pendingChanges: false,
        fixHints: [],
      },
      doctorFixCommand: "GreenchClaw doctor --fix",
    });

    expect(result.changeNotes).toStrictEqual([]);
    expect(result.warningNotes).toStrictEqual([
      "channels.discord.allowFrom[0] cannot be auto-repaired because it is not a safe integer",
    ]);
    expect(result.state.pendingChanges).toBe(false);
    expect(result.state.candidate.channels?.discord?.allowFrom).toEqual([106232522769186816]);
  });

  it("auto-enables newly installed configured plugins after doctor repair", async () => {
    mocks.repairMissingConfiguredPluginInstalls.mockResolvedValueOnce({
      changes: ['Installed missing configured plugin "brave" from @GreenchClaw/brave-plugin.'],
      warnings: [],
    });
    mocks.applyPluginAutoEnable.mockImplementationOnce((params: { config: GreenchClawConfig }) => ({
      config: {
        ...params.config,
        plugins: {
          ...params.config.plugins,
          allow: ["telegram", "brave"],
          entries: {
            ...params.config.plugins?.entries,
            brave: { enabled: true },
          },
        },
      },
      changes: ["brave web search provider selected, enabled automatically."],
    }));

    const result = await runDoctorRepairSequence({
      state: {
        cfg: {
          tools: { web: { search: { provider: "brave" } } },
          plugins: { allow: ["telegram"] },
        } as GreenchClawConfig,
        candidate: {
          tools: { web: { search: { provider: "brave" } } },
          plugins: { allow: ["telegram"] },
        } as GreenchClawConfig,
        pendingChanges: false,
        fixHints: [],
      },
      doctorFixCommand: "GreenchClaw doctor --fix",
    });

    expect(result.state.pendingChanges).toBe(true);
    expect(result.state.candidate.plugins?.allow).toEqual(["telegram", "brave"]);
    expect(result.state.candidate.plugins?.entries?.brave?.enabled).toBe(true);
    expect(result.changeNotes).toStrictEqual([
      'Installed missing configured plugin "brave" from @GreenchClaw/brave-plugin.',
      "brave web search provider selected, enabled automatically.",
    ]);
  });

  it("moves legacy Codex routes to canonical OpenAI before missing plugin install repair", async () => {
    mocks.repairMissingConfiguredPluginInstalls.mockImplementationOnce(
      async (params: { cfg: GreenchClawConfig }) => {
        expect(params.cfg.agents?.defaults?.model).toBe("openai/gpt-5.5");
        expect(params.cfg.agents?.defaults?.agentRuntime).toBeUndefined();
        return {
          changes: [],
          warnings: [],
        };
      },
    );

    const result = await runDoctorRepairSequence({
      state: {
        cfg: {
          agents: {
            defaults: {
              model: "openai-codex/gpt-5.5",
            },
          },
        } as GreenchClawConfig,
        candidate: {
          agents: {
            defaults: {
              model: "openai-codex/gpt-5.5",
            },
          },
        } as GreenchClawConfig,
        pendingChanges: false,
        fixHints: [],
      },
      doctorFixCommand: "GreenchClaw doctor --fix",
      env: {},
    });

    expect(result.state.pendingChanges).toBe(true);
    expect(result.state.candidate.agents?.defaults?.model).toBe("openai/gpt-5.5");
    expect(result.state.candidate.agents?.defaults?.agentRuntime).toBeUndefined();
    expect(result.changeNotes).toStrictEqual([
      'Repaired Codex model routes:- agents.defaults.model: openai-codex/gpt-5.5 -> openai/gpt-5.5.\nSet agents.defaults.models.openai/gpt-5.5.agentRuntime.id to "codex" so repaired OpenAI refs keep Codex auth routing.',
    ]);
  });

  it("does not remove deferred configured plugins during the package update doctor pass", async () => {
    mocks.repairMissingConfiguredPluginInstalls.mockResolvedValueOnce({
      changes: [
        'Skipped package-manager repair for configured plugin "brave" during package update; rerun "GreenchClaw doctor --fix" after the update completes.',
      ],
      warnings: [],
    });
    mocks.maybeRepairStalePluginConfig.mockImplementationOnce((cfg: GreenchClawConfig) => ({
      config: {
        ...cfg,
        plugins: {
          ...cfg.plugins,
          allow: [],
          entries: {},
        },
      },
      changes: ["- plugins.entries: removed 1 stale plugin entry (brave)"],
    }));

    const result = await runDoctorRepairSequence({
      state: {
        cfg: {
          plugins: {
            allow: ["brave"],
            entries: {
              brave: {
                enabled: true,
                config: {
                  webSearch: {
                    apiKey: {
                      source: "env",
                      provider: "default",
                      id: "BRAVE_API_KEY",
                    },
                  },
                },
              },
            },
          },
        } as GreenchClawConfig,
        candidate: {
          plugins: {
            allow: ["brave"],
            entries: {
              brave: {
                enabled: true,
                config: {
                  webSearch: {
                    apiKey: {
                      source: "env",
                      provider: "default",
                      id: "BRAVE_API_KEY",
                    },
                  },
                },
              },
            },
          },
        } as GreenchClawConfig,
        pendingChanges: false,
        fixHints: [],
      },
      doctorFixCommand: "GreenchClaw doctor --fix",
      env: {
        GREENCHCLAW_UPDATE_IN_PROGRESS: "1",
      },
    });

    expect(mocks.maybeRepairStalePluginConfig).not.toHaveBeenCalled();
    expect(result.state.candidate.plugins?.allow).toEqual(["brave"]);
    expect(result.state.candidate.plugins?.entries?.brave?.enabled).toBe(true);
    expect(result.changeNotes).toStrictEqual([
      'Skipped package-manager repair for configured plugin "brave" during package update; rerun "GreenchClaw doctor --fix" after the update completes.',
    ]);
  });

  it("preserves configured plugins when their install repair fails", async () => {
    mocks.repairMissingConfiguredPluginInstalls.mockResolvedValueOnce({
      changes: [],
      warnings: [
        'Failed to install missing configured plugin "brave" from @GreenchClaw/brave-plugin: package install failed',
      ],
    });
    mocks.maybeRepairStalePluginConfig.mockImplementationOnce((cfg: GreenchClawConfig) => ({
      config: {
        ...cfg,
        plugins: {
          ...cfg.plugins,
          allow: [],
          entries: {},
        },
      },
      changes: ["plugins.entries: removed 1 stale plugin entry (brave)"],
    }));

    const result = await runDoctorRepairSequence({
      state: {
        cfg: {
          plugins: {
            allow: ["brave"],
            entries: {
              brave: {
                enabled: true,
                config: {
                  webSearch: {
                    apiKey: {
                      source: "env",
                      provider: "default",
                      id: "BRAVE_API_KEY",
                    },
                  },
                },
              },
            },
          },
        } as GreenchClawConfig,
        candidate: {
          plugins: {
            allow: ["brave"],
            entries: {
              brave: {
                enabled: true,
                config: {
                  webSearch: {
                    apiKey: {
                      source: "env",
                      provider: "default",
                      id: "BRAVE_API_KEY",
                    },
                  },
                },
              },
            },
          },
        } as GreenchClawConfig,
        pendingChanges: false,
        fixHints: [],
      },
      doctorFixCommand: "GreenchClaw doctor --fix",
    });

    expect(mocks.maybeRepairStalePluginConfig).not.toHaveBeenCalled();
    expect(result.state.candidate.plugins?.allow).toEqual(["brave"]);
    expect(result.state.candidate.plugins?.entries?.brave?.enabled).toBe(true);
    expect(result.state.pendingChanges).toBe(false);
    expect(result.warningNotes).toStrictEqual([
      'Failed to install missing configured plugin "brave" from @GreenchClaw/brave-plugin: package install failed',
    ]);
  });
});
