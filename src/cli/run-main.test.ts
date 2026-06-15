import { describe, expect, it } from "vitest";
import type { PluginManifestCommandAliasRegistry } from "../plugins/manifest-command-aliases.js";
import {
  rewriteUpdateFlagArgv,
  resolveMissingPluginCommandMessage,
  shouldEnsureCliPath,
  shouldStartCrestodianForBareRoot,
  shouldStartCrestodianForModernOnboard,
  shouldStartProxyForCli,
  shouldUseBrowserHelpFastPath,
  shouldUseRootHelpFastPath,
} from "./run-main-policy.js";
import { isGatewayRunFastPathArgv } from "./run-main.js";

const memoryWikiCommandAliasRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "memory-wiki",
      enabledByDefault: true,
      commandAliases: [{ name: "wiki" }],
    },
  ],
};

const memoryCoreCommandAliasRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "memory-core",
      commandAliases: [{ name: "dreaming", kind: "runtime-slash", cliCommand: "memory" }],
    },
  ],
};

const losslessClawToolRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "lossless-claw",
      contracts: { tools: ["lcm_recent", "lcm_search"] },
    },
  ],
};

const browserCommandAliasRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "browser",
      enabledByDefault: true,
      commandAliases: [{ name: "browser" }],
    },
  ],
};

describe("isGatewayRunFastPathArgv", () => {
  it("matches only plain gateway foreground starts without root options or help", () => {
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway"])).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "--force"])).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "--port", "18789"])).toBe(
      true,
    );
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "--auth=none"])).toBe(true);
    expect(
      isGatewayRunFastPathArgv([
        "node",
        "GreenchClaw",
        "--no-color",
        "gateway",
        "--bind",
        "loopback",
      ]),
    ).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "run"])).toBe(true);
    expect(
      isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "run", "--raw-stream-path", "x"]),
    ).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "call", "health"])).toBe(
      false,
    );
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "--help"])).toBe(false);
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "--port"])).toBe(false);
    expect(isGatewayRunFastPathArgv(["node", "GreenchClaw", "gateway", "--unknown"])).toBe(false);
  });
});

describe("rewriteUpdateFlagArgv", () => {
  it("leaves argv unchanged when --update is absent", () => {
    const argv = ["node", "entry.js", "status"];
    expect(rewriteUpdateFlagArgv(argv)).toBe(argv);
  });

  it("rewrites --update into the update command", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update"])).toEqual([
      "node",
      "entry.js",
      "update",
    ]);
  });

  it("preserves global flags that appear before --update", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--profile", "p", "--update"])).toEqual([
      "node",
      "entry.js",
      "--profile",
      "p",
      "update",
    ]);
  });

  it("keeps update options after the rewritten command", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update", "--json"])).toEqual([
      "node",
      "entry.js",
      "update",
      "--json",
    ]);
  });
});

describe("shouldEnsureCliPath", () => {
  it("skips path bootstrap for help/version invocations", () => {
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "--help"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "-V"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "-v"])).toBe(false);
  });

  it("skips path bootstrap for read-only fast paths", () => {
    expect(shouldEnsureCliPath(["node", "GreenchClaw"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "--profile", "work"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "status"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "--log-level", "debug", "status"])).toBe(
      false,
    );
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "sessions", "--json"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "config", "get", "update"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "models", "status", "--json"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "tools", "effective"])).toBe(false);
  });

  it("keeps path bootstrap for mutating or unknown commands", () => {
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "message", "send"])).toBe(true);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "voicecall", "status"])).toBe(true);
    expect(shouldEnsureCliPath(["node", "GreenchClaw", "acp", "-v"])).toBe(true);
  });
});

describe("shouldStartCrestodianForBareRoot", () => {
  it("starts Crestodian for bare root invocations", () => {
    expect(shouldStartCrestodianForBareRoot(["node", "GreenchClaw"])).toBe(true);
    expect(shouldStartCrestodianForBareRoot(["node", "GreenchClaw", "--profile", "work"])).toBe(
      true,
    );
    expect(shouldStartCrestodianForBareRoot(["node", "GreenchClaw", "--dev"])).toBe(true);
  });

  it("does not start Crestodian for help, version, or commands", () => {
    expect(shouldStartCrestodianForBareRoot(["node", "GreenchClaw", "--help"])).toBe(false);
    expect(shouldStartCrestodianForBareRoot(["node", "GreenchClaw", "-V"])).toBe(false);
    expect(shouldStartCrestodianForBareRoot(["node", "GreenchClaw", "status"])).toBe(false);
  });
});

describe("shouldStartCrestodianForModernOnboard", () => {
  it("starts Crestodian before heavy command registration for modern onboard", () => {
    expect(
      shouldStartCrestodianForModernOnboard([
        "node",
        "GreenchClaw",
        "onboard",
        "--modern",
        "--non-interactive",
        "--json",
      ]),
    ).toBe(true);
  });

  it("keeps classic onboard and help on the normal command path", () => {
    expect(shouldStartCrestodianForModernOnboard(["node", "GreenchClaw", "onboard"])).toBe(false);
    expect(
      shouldStartCrestodianForModernOnboard([
        "node",
        "GreenchClaw",
        "onboard",
        "--modern",
        "--help",
      ]),
    ).toBe(false);
  });
});

describe("shouldStartProxyForCli", () => {
  it("starts managed proxy routing for the --update shorthand", () => {
    expect(shouldStartProxyForCli(["node", "GreenchClaw", "--update"])).toBe(true);
    expect(shouldStartProxyForCli(["node", "GreenchClaw", "--profile", "p", "--update"])).toBe(
      true,
    );
  });
});

describe("shouldUseRootHelpFastPath", () => {
  it("uses the fast path for root help only", () => {
    expect(shouldUseRootHelpFastPath(["node", "GreenchClaw", "--help"])).toBe(true);
    expect(shouldUseRootHelpFastPath(["node", "GreenchClaw", "--profile", "work", "-h"])).toBe(
      true,
    );
    expect(shouldUseRootHelpFastPath(["node", "GreenchClaw", "help", "--help"])).toBe(true);
    expect(shouldUseRootHelpFastPath(["node", "GreenchClaw", "tools", "--help"])).toBe(true);
    expect(shouldUseRootHelpFastPath(["node", "GreenchClaw", "status", "--help"])).toBe(false);
    expect(shouldUseRootHelpFastPath(["node", "GreenchClaw", "--help", "status"])).toBe(false);
    expect(shouldUseRootHelpFastPath(["node", "GreenchClaw", "help", "gateway"])).toBe(false);
  });
});

describe("shouldUseBrowserHelpFastPath", () => {
  it("uses the fast path for browser command help only", () => {
    expect(shouldUseBrowserHelpFastPath(["node", "GreenchClaw", "browser", "--help"])).toBe(true);
    expect(shouldUseBrowserHelpFastPath(["node", "GreenchClaw", "browser", "-h"])).toBe(true);
    expect(
      shouldUseBrowserHelpFastPath(["node", "GreenchClaw", "--profile", "work", "browser", "-h"]),
    ).toBe(true);
    expect(
      shouldUseBrowserHelpFastPath(["node", "GreenchClaw", "browser", "status", "--help"]),
    ).toBe(false);
    expect(shouldUseBrowserHelpFastPath(["node", "GreenchClaw", "status", "--help"])).toBe(false);
  });
});

describe("resolveMissingPluginCommandMessage", () => {
  it("explains plugins.allow misses for a bundled plugin command", () => {
    expect(
      resolveMissingPluginCommandMessage(
        "browser",
        {
          plugins: {
            allow: ["quietchat"],
          },
        },
        { registry: browserCommandAliasRegistry },
      ),
    ).toContain('`plugins.allow` excludes "browser"');
  });

  it("explains explicit bundled plugin disablement", () => {
    expect(
      resolveMissingPluginCommandMessage("browser", {
        plugins: {
          entries: {
            browser: {
              enabled: false,
            },
          },
        },
      }),
    ).toContain("plugins.entries.browser.enabled=false");
  });

  it("returns null when the bundled plugin command is already allowed", () => {
    expect(
      resolveMissingPluginCommandMessage("browser", {
        plugins: {
          allow: ["browser"],
        },
      }),
    ).toBeNull();
  });

  it("does not classify reserved non-plugin command roots as plugin allowlist misses", () => {
    for (const root of ["auth", "tool"]) {
      const message = resolveMissingPluginCommandMessage(root, {
        plugins: {
          allow: ["browser"],
        },
      });
      expect(message).toBeNull();
    }
  });

  it("explains that dreaming is a runtime slash command, not a CLI command", () => {
    const message = resolveMissingPluginCommandMessage(
      "dreaming",
      {},
      {
        registry: memoryCoreCommandAliasRegistry,
      },
    );
    expect(message).toContain("runtime slash command");
    expect(message).toContain("/dreaming");
    expect(message).toContain("memory-core");
    expect(message).toContain("GreenchClaw memory");
  });

  it("returns the runtime command message even when plugins.allow is set", () => {
    const message = resolveMissingPluginCommandMessage(
      "dreaming",
      {
        plugins: {
          allow: ["memory-core"],
        },
      },
      {
        registry: memoryCoreCommandAliasRegistry,
      },
    );
    expect(message).toContain("runtime slash command");
    expect(message).not.toContain("plugins.allow");
  });

  it("points command names in plugins.allow at their parent plugin", () => {
    const message = resolveMissingPluginCommandMessage(
      "dreaming",
      {
        plugins: {
          allow: ["dreaming"],
        },
      },
      {
        registry: memoryCoreCommandAliasRegistry,
      },
    );
    expect(message).toContain('"dreaming" is not a plugin');
    expect(message).toContain('"memory-core"');
    expect(message).toContain("plugins.allow");
  });

  it("explains disabled-by-default parent plugins for CLI command aliases", () => {
    const message = resolveMissingPluginCommandMessage(
      "voicecall",
      {},
      {
        registry: {
          plugins: [
            {
              id: "voice-call",
              commandAliases: [{ name: "voicecall" }],
            },
          ],
        },
      },
    );

    expect(message).toContain('"voice-call" plugin');
    expect(message).toContain("disabled by default");
    expect(message).toContain("GreenchClaw plugins enable voice-call");
  });

  it("returns null for CLI command aliases when disabled-by-default parent plugins are enabled", () => {
    const message = resolveMissingPluginCommandMessage(
      "voicecall",
      {
        plugins: {
          entries: {
            "voice-call": {
              enabled: true,
            },
          },
        },
      },
      {
        registry: {
          plugins: [
            {
              id: "voice-call",
              commandAliases: [{ name: "voicecall" }],
            },
          ],
        },
      },
    );

    expect(message).toBeNull();
  });

  it("explains parent plugin disablement for runtime command aliases", () => {
    const message = resolveMissingPluginCommandMessage(
      "dreaming",
      {
        plugins: {
          entries: {
            "memory-core": {
              enabled: false,
            },
          },
        },
      },
      {
        registry: memoryCoreCommandAliasRegistry,
      },
    );
    expect(message).toContain("plugins.entries.memory-core.enabled=false");
    expect(message).not.toContain("runtime slash command");
  });

  it("allows CLI commands when their parent plugin is in plugins.allow", () => {
    const message = resolveMissingPluginCommandMessage(
      "wiki",
      {
        plugins: {
          allow: ["memory-wiki"],
        },
      },
      { registry: memoryWikiCommandAliasRegistry },
    );
    expect(message).toBeNull();
  });

  it("blocks CLI commands when parent plugin is NOT in plugins.allow", () => {
    const message = resolveMissingPluginCommandMessage(
      "wiki",
      {
        plugins: {
          allow: ["quietchat"],
        },
      },
      { registry: memoryWikiCommandAliasRegistry },
    );
    expect(message).toContain('"memory-wiki"');
    expect(message).toContain("plugins.allow");
  });

  it("identifies an agent tool name and points the user at model tool-use", () => {
    const message = resolveMissingPluginCommandMessage(
      "lcm_recent",
      {
        plugins: {
          allow: ["lossless-claw"],
        },
      },
      { registry: losslessClawToolRegistry },
    );
    if (message === null) {
      throw new Error("expected missing plugin command message");
    }
    expect(message).toContain('"lcm_recent"');
    expect(message).toContain('"lossless-claw"');
    expect(message).toContain("agent tool");
    expect(message).not.toContain("plugins.allow");
  });

  it("matches agent tool names case-insensitively", () => {
    const message = resolveMissingPluginCommandMessage("LCM_Recent", undefined, {
      registry: losslessClawToolRegistry,
    });
    if (message === null) {
      throw new Error("expected missing plugin command message");
    }
    expect(message).toContain("agent tool");
    expect(message).toContain('"lossless-claw"');
  });

  it("returns null for unknown names excluded by plugins.allow", () => {
    const message = resolveMissingPluginCommandMessage(
      "totally-unknown",
      {
        plugins: {
          allow: ["quietchat"],
        },
      },
      { registry: losslessClawToolRegistry },
    );
    expect(message).toBeNull();
  });

  it("points metadata-only CLI roots in plugins.allow at their parent plugin", () => {
    const message = resolveMissingPluginCommandMessage(
      "qa",
      {
        plugins: {
          allow: ["browser"],
        },
      },
      {
        resolveCliCommandSurfaceOwner: () => "qa-lab",
      },
    );
    expect(message).toContain('"qa" is not a plugin');
    expect(message).toContain('"qa-lab"');
    expect(message).toContain('Add "qa-lab" to `plugins.allow` instead of "qa"');
  });

  it("does not attribute a tool to an owning plugin excluded by plugins.allow", () => {
    // The owning plugin is denied via plugins.allow, so the manifest-declared
    // tool is not available through the owning plugin. Tool names are not CLI
    // command surfaces, so do not suggest adding the tool name to plugins.allow.
    const message = resolveMissingPluginCommandMessage(
      "lcm_recent",
      {
        plugins: {
          allow: ["quietchat"],
        },
      },
      { registry: losslessClawToolRegistry },
    );
    expect(message).toBeNull();
  });

  it("does not attribute a tool to an owning plugin disabled via plugins.entries", () => {
    const message = resolveMissingPluginCommandMessage(
      "lcm_recent",
      {
        plugins: {
          entries: {
            "lossless-claw": { enabled: false },
          },
        },
      },
      { registry: losslessClawToolRegistry },
    );
    // entries.<id>.enabled = false on the OWNING plugin invalidates the
    // plugin-tool attribution. With no allow filter on the bare name the
    // diagnostic returns null (no actionable message); callers handle that
    // as "not a recognised plugin command".
    expect(message).toBeNull();
  });

  it("uses softer 'may be provided by' wording for manifest-only availability", () => {
    // Some runtime gates (per-account enabled, per-tool toggles in the Feishu
    // family etc.) cannot be expressed as manifest configSignals, so the
    // runtime resolver reports availability: "manifest-only" when ownership is
    // only manifest-provable. The diagnostic must avoid asserting "registered
    // by" in that case.
    const manifestOnlyOwner = {
      toolName: "feishu_chat",
      pluginId: "feishu",
      availability: "manifest-only" as const,
    };
    const message = resolveMissingPluginCommandMessage("feishu_chat", undefined, {
      resolveToolOwner: () => manifestOnlyOwner,
    });
    if (message === null) {
      throw new Error("expected missing plugin command message");
    }
    expect(message).toContain("may be provided by");
    expect(message).toContain('"feishu"');
    expect(message).not.toContain("registered by");
  });
});
