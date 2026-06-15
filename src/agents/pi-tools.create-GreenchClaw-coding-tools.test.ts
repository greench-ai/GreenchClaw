import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import {
  findUnsupportedSchemaKeywords,
  GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS,
} from "../plugin-sdk/provider-tools.js";
import "./test-helpers/fast-bash-tools.js";
import "./test-helpers/fast-coding-tools.js";
import "./test-helpers/fast-GreenchClaw-tools.js";
import * as openClawPluginTools from "./GreenchClaw-plugin-tools.js";
import { createGreenchClawTools } from "./GreenchClaw-tools.js";
import { createGreenchClawCodingTools } from "./pi-tools.js";
import { createHostSandboxFsBridge } from "./test-helpers/host-sandbox-fs-bridge.js";
import { expectReadWriteEditTools } from "./test-helpers/pi-tools-fs-helpers.js";
import { createPiToolsSandboxContext } from "./test-helpers/pi-tools-sandbox-context.js";
import { providerAliasCases } from "./test-helpers/provider-alias-cases.js";
import { buildEmptyExplicitToolAllowlistError } from "./tool-allowlist-guard.js";
import { DEFAULT_PLUGIN_TOOLS_ALLOWLIST_ENTRY, normalizeToolName } from "./tool-policy.js";

const tinyPngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2f7z8AAAAASUVORK5CYII=",
  "base64",
);
const XAI_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minContains",
  "maxContains",
]);

function collectActionValues(schema: unknown, values: Set<string>): void {
  if (!schema || typeof schema !== "object") {
    return;
  }

  const record = schema as Record<string, unknown>;
  if (typeof record.const === "string") {
    values.add(record.const);
  }
  if (Array.isArray(record.enum)) {
    for (const value of record.enum) {
      if (typeof value === "string") {
        values.add(value);
      }
    }
  }
  if (Array.isArray(record.anyOf)) {
    for (const variant of record.anyOf) {
      collectActionValues(variant, values);
    }
  }
}

async function writeSessionStore(
  storeTemplate: string,
  agentId: string,
  entries: Record<string, unknown>,
) {
  await fs.writeFile(
    storeTemplate.replaceAll("{agentId}", agentId),
    JSON.stringify(entries, null, 2),
    "utf-8",
  );
}

function createToolsForStoredSession(storeTemplate: string, sessionKey: string) {
  return createGreenchClawCodingTools({
    sessionKey,
    config: {
      session: {
        store: storeTemplate,
      },
      agents: {
        defaults: {
          subagents: {
            maxSpawnDepth: 2,
          },
        },
      },
    },
  });
}

function expectNoSubagentControlTools(tools: ReturnType<typeof createGreenchClawCodingTools>) {
  const names = new Set(tools.map((tool) => tool.name));
  expect(names.has("sessions_spawn")).toBe(false);
  expect(names.has("sessions_list")).toBe(false);
  expect(names.has("sessions_history")).toBe(false);
  expect(names.has("subagents")).toBe(false);
}

function applyRuntimeToolsAllow<T extends { name: string }>(tools: T[], toolsAllow: string[]) {
  const allowSet = new Set(toolsAllow.map((name) => normalizeToolName(name)));
  return tools.filter((tool) => allowSet.has(normalizeToolName(tool.name)));
}

type GreenchClawCodingTool = ReturnType<typeof createGreenchClawCodingTools>[number];
type GreenchClawToolsOptions = NonNullable<Parameters<typeof createGreenchClawTools>[0]>;

function toolNameList(tools: readonly { name: string }[]): string[] {
  return tools.map((tool) => tool.name);
}

function requireTool(tools: GreenchClawCodingTool[], name: string): GreenchClawCodingTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`expected ${name} tool`);
  }
  return tool;
}

function requireToolExecute(
  tool: GreenchClawCodingTool,
): NonNullable<GreenchClawCodingTool["execute"]> {
  if (!tool.execute) {
    throw new Error(`expected ${tool.name} tool execute`);
  }
  return tool.execute;
}

function latestCreateGreenchClawToolsOptions(): GreenchClawToolsOptions {
  const calls = vi.mocked(createGreenchClawTools).mock.calls;
  const lastCall = calls.at(-1);
  const options = lastCall?.[0];
  if (!options) {
    throw new Error("expected createGreenchClawTools call");
  }
  return options;
}

function expectListIncludes(
  list: readonly string[] | undefined,
  expected: readonly string[],
): void {
  if (!list) {
    throw new Error("expected string list");
  }
  for (const value of expected) {
    expect(list.includes(value)).toBe(true);
  }
}

describe("createGreenchClawCodingTools", () => {
  const testConfig: GreenchClawConfig = {};

  it("exposes gateway config and restart actions to owner sessions", () => {
    const tools = createGreenchClawCodingTools({ config: testConfig, senderIsOwner: true });
    const gateway = requireTool(tools, "gateway");

    const parameters = gateway.parameters as {
      properties?: Record<string, unknown>;
    };
    const action = parameters.properties?.action as
      | { const?: unknown; enum?: unknown[] }
      | undefined;
    const values = new Set<string>();
    collectActionValues(action, values);

    expectListIncludes([...values], ["restart", "config.get", "config.patch", "config.apply"]);
  });

  it("does not add Tool Search control tools from the shared factory by default", () => {
    const tools = createGreenchClawCodingTools({
      config: {
        tools: {
          toolSearch: true,
        },
      },
    });
    const names = new Set(tools.map((tool) => tool.name));

    expect(names.has("tool_search_code")).toBe(false);
    expect(names.has("tool_search")).toBe(false);
    expect(names.has("tool_describe")).toBe(false);
    expect(names.has("tool_call")).toBe(false);
  });

  it("adds PI Tool Search control tools when explicitly requested", () => {
    const tools = createGreenchClawCodingTools({
      includeToolSearchControls: true,
      config: {
        tools: {
          toolSearch: true,
        },
      },
    });
    const names = new Set(tools.map((tool) => tool.name));

    expect(names.has("tool_search_code")).toBe(true);
    expect(names.has("tool_search")).toBe(true);
    expect(names.has("tool_describe")).toBe(true);
    expect(names.has("tool_call")).toBe(true);
  });

  it("keeps PI Tool Search controls available under restrictive tool profiles", () => {
    const tools = createGreenchClawCodingTools({
      includeToolSearchControls: true,
      config: {
        tools: {
          profile: "coding",
          toolSearch: true,
        },
      },
    });
    const names = new Set(tools.map((tool) => tool.name));

    expect(names.has("tool_search_code")).toBe(true);
    expect(names.has("tool_search")).toBe(true);
    expect(names.has("tool_describe")).toBe(true);
    expect(names.has("tool_call")).toBe(true);
    expect(names.has("message")).toBe(false);
  });

  it("keeps PI Tool Search controls available under restrictive tool allowlists", () => {
    const tools = createGreenchClawCodingTools({
      includeToolSearchControls: true,
      config: {
        tools: {
          allow: ["read"],
          toolSearch: true,
        },
      },
    });
    const names = new Set(tools.map((tool) => tool.name));

    expect(names.has("read")).toBe(true);
    expect(names.has("exec")).toBe(false);
    expect(names.has("tool_search_code")).toBe(true);
    expect(names.has("tool_search")).toBe(true);
    expect(names.has("tool_describe")).toBe(true);
    expect(names.has("tool_call")).toBe(true);
  });

  it("lets explicit deny policies remove PI Tool Search controls", () => {
    const tools = createGreenchClawCodingTools({
      includeToolSearchControls: true,
      config: {
        tools: {
          profile: "coding",
          deny: ["tool_search_code"],
          toolSearch: true,
        },
      },
    });
    const names = new Set(tools.map((tool) => tool.name));

    expect(names.has("tool_search_code")).toBe(false);
    expect(names.has("read")).toBe(true);
  });

  it("keeps PI Tool Search controls when core GreenchClaw tools are not materialized", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();

    const tools = createGreenchClawCodingTools({
      includeCoreTools: false,
      includeToolSearchControls: true,
      toolConstructionPlan: {
        includeBaseCodingTools: false,
        includeShellTools: false,
        includeChannelTools: false,
        includeGreenchClawTools: false,
        includePluginTools: true,
      },
      config: {
        tools: {
          toolSearch: true,
        },
      },
    });
    const names = new Set(tools.map((tool) => tool.name));

    expect(createGreenchClawToolsMock).not.toHaveBeenCalled();
    expect(names.has("tool_search_code")).toBe(true);
    expect(names.has("tool_search")).toBe(true);
    expect(names.has("tool_describe")).toBe(true);
    expect(names.has("tool_call")).toBe(true);
    expect(names.has("message")).toBe(false);
    expect(names.has("exec")).toBe(false);
  });

  it("exposes only an explicitly authorized owner-only tool to non-owner sessions", () => {
    const tools = createGreenchClawCodingTools({
      config: testConfig,
      senderIsOwner: false,
      ownerOnlyToolAllowlist: ["cron"],
    });
    const names = new Set(tools.map((tool) => tool.name));

    expect(names.has("cron")).toBe(true);
    expect(names.has("gateway")).toBe(false);
    expect(names.has("nodes")).toBe(false);
  });

  it("resolves isolated cron runtime toolsAllow after the cron owner-only grant", () => {
    const withoutGrant = applyRuntimeToolsAllow(
      createGreenchClawCodingTools({
        config: testConfig,
        senderIsOwner: false,
      }),
      ["cron"],
    );
    const errorWithoutGrant = buildEmptyExplicitToolAllowlistError({
      sources: [{ label: "runtime toolsAllow", entries: ["cron"] }],
      callableToolNames: withoutGrant.map((tool) => tool.name),
      toolsEnabled: true,
    });

    expect(errorWithoutGrant?.message).toContain(
      "No callable tools remain after resolving explicit tool allowlist (runtime toolsAllow: cron); no registered tools matched.",
    );

    const withGrant = applyRuntimeToolsAllow(
      createGreenchClawCodingTools({
        config: testConfig,
        senderIsOwner: false,
        ownerOnlyToolAllowlist: ["cron"],
      }),
      ["cron"],
    );

    expect(withGrant.map((tool) => tool.name)).toEqual(["cron"]);
    expect(
      buildEmptyExplicitToolAllowlistError({
        sources: [{ label: "runtime toolsAllow", entries: ["cron"] }],
        callableToolNames: withGrant.map((tool) => tool.name),
        toolsEnabled: true,
      }),
    ).toBeNull();
  });

  it("uses runtime toolsAllow when materializing plugin tools", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();

    createGreenchClawCodingTools({
      config: testConfig,
      runtimeToolAllowlist: ["memory_search", "memory_get"],
    });

    expect(createGreenchClawToolsMock).toHaveBeenCalledTimes(1);
    const options = latestCreateGreenchClawToolsOptions();
    expectListIncludes(options.pluginToolAllowlist, ["memory_search", "memory_get"]);
  });

  it("passes source reply delivery mode to GreenchClaw tool construction", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();

    createGreenchClawCodingTools({
      config: testConfig,
      forceMessageTool: true,
      sourceReplyDeliveryMode: "message_tool_only",
    });

    expect(createGreenchClawToolsMock).toHaveBeenCalledTimes(1);
    expect(latestCreateGreenchClawToolsOptions().sourceReplyDeliveryMode).toBe("message_tool_only");
  });

  it("skips unrelated tool families when construction is planned from a narrow allowlist", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();

    const tools = createGreenchClawCodingTools({
      config: testConfig,
      toolConstructionPlan: {
        includeBaseCodingTools: true,
        includeShellTools: false,
        includeChannelTools: false,
        includeGreenchClawTools: false,
        includePluginTools: false,
      },
    });
    const names = new Set(tools.map((tool) => tool.name));

    expect(createGreenchClawToolsMock).not.toHaveBeenCalled();
    expect(names.has("read")).toBe(true);
    expect(names.has("write")).toBe(true);
    expect(names.has("edit")).toBe(true);
    expect(names.has("exec")).toBe(false);
    expect(names.has("process")).toBe(false);
    expect(names.has("apply_patch")).toBe(false);
    expect(names.has("message")).toBe(false);
  });

  it("passes plugin suppression into GreenchClaw tool construction plans", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();

    createGreenchClawCodingTools({
      config: testConfig,
      toolConstructionPlan: {
        includeBaseCodingTools: false,
        includeShellTools: false,
        includeChannelTools: false,
        includeGreenchClawTools: true,
        includePluginTools: false,
      },
    });

    expect(createGreenchClawToolsMock).toHaveBeenCalledTimes(1);
    expect(latestCreateGreenchClawToolsOptions().disablePluginTools).toBe(true);
  });

  it("keeps plugin-only construction off the GreenchClaw core factory", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();

    createGreenchClawCodingTools({
      config: testConfig,
      includeCoreTools: false,
      runtimeToolAllowlist: ["memory_search"],
      toolConstructionPlan: {
        includeBaseCodingTools: false,
        includeShellTools: false,
        includeChannelTools: false,
        includeGreenchClawTools: false,
        includePluginTools: true,
      },
    });

    expect(createGreenchClawToolsMock).not.toHaveBeenCalled();
  });

  it("forwards active model metadata to plugin-only tool construction", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();
    const resolvePluginToolsSpy = vi
      .spyOn(openClawPluginTools, "resolveGreenchClawPluginToolsForOptions")
      .mockReturnValue([]);

    try {
      createGreenchClawCodingTools({
        config: testConfig,
        includeCoreTools: false,
        runtimeToolAllowlist: ["memory_search"],
        modelProvider: "openrouter",
        modelId: "openrouter/auto",
        toolConstructionPlan: {
          includeBaseCodingTools: false,
          includeShellTools: false,
          includeChannelTools: false,
          includeGreenchClawTools: false,
          includePluginTools: true,
        },
      });

      expect(createGreenchClawToolsMock).not.toHaveBeenCalled();
      expect(resolvePluginToolsSpy).toHaveBeenCalledTimes(1);
      const pluginToolOptions = resolvePluginToolsSpy.mock.calls.at(0)?.[0].options;
      expect(pluginToolOptions?.modelProvider).toBe("openrouter");
      expect(pluginToolOptions?.modelId).toBe("openrouter/auto");
    } finally {
      resolvePluginToolsSpy.mockRestore();
    }
  });

  it("uses tools.alsoAllow for optional plugin discovery without widening to all plugins", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();

    createGreenchClawCodingTools({
      config: { tools: { alsoAllow: ["lobster"] } },
    });

    expect(createGreenchClawToolsMock).toHaveBeenCalledTimes(1);
    expect(latestCreateGreenchClawToolsOptions().pluginToolAllowlist).toStrictEqual([
      "lobster",
      DEFAULT_PLUGIN_TOOLS_ALLOWLIST_ENTRY,
    ]);
  });

  it("passes explicit denylist entries to GreenchClaw tool factory planning", () => {
    const createGreenchClawToolsMock = vi.mocked(createGreenchClawTools);
    createGreenchClawToolsMock.mockClear();

    createGreenchClawCodingTools({
      config: { tools: { deny: ["pdf"] } },
    });

    expect(createGreenchClawToolsMock).toHaveBeenCalledTimes(1);
    expectListIncludes(latestCreateGreenchClawToolsOptions().pluginToolDenylist, ["pdf"]);
  });

  it("records core tool-prep stages for hot-path diagnostics", () => {
    const stages: string[] = [];

    createGreenchClawCodingTools({
      config: testConfig,
      recordToolPrepStage: (name) => stages.push(name),
      senderIsOwner: true,
    });

    expectListIncludes(stages, [
      "tool-policy",
      "workspace-policy",
      "base-coding-tools",
      "shell-tools",
      "GreenchClaw-tools:test-helper",
      "GreenchClaw-tools",
      "message-provider-policy",
      "model-provider-policy",
      "authorization-policy",
      "schema-normalization",
      "tool-hooks",
      "abort-wrappers",
      "deferred-followup-descriptions",
    ]);
    expect(stages.indexOf("tool-policy")).toBeLessThan(stages.indexOf("workspace-policy"));
    expect(stages.indexOf("workspace-policy")).toBeLessThan(stages.indexOf("base-coding-tools"));
    expect(stages.indexOf("GreenchClaw-tools:test-helper")).toBeLessThan(
      stages.indexOf("GreenchClaw-tools"),
    );
    expect(stages.indexOf("schema-normalization")).toBeLessThan(stages.indexOf("tool-hooks"));
  });

  it("preserves action enums in normalized schemas", () => {
    const defaultTools = createGreenchClawCodingTools({ config: testConfig, senderIsOwner: true });
    const toolNames = ["canvas", "nodes", "cron", "gateway", "message"];
    const missingNames = toolNames.filter(
      (name) => !defaultTools.some((candidate) => candidate.name === name),
    );
    expect(missingNames).toStrictEqual([]);

    for (const name of toolNames) {
      const tool = defaultTools.find((candidate) => candidate.name === name);
      const parameters = tool?.parameters as {
        properties?: Record<string, unknown>;
      };
      const action = parameters.properties?.action as
        | { const?: unknown; enum?: unknown[] }
        | undefined;
      const values = new Set<string>();
      collectActionValues(action, values);

      const min = name === "gateway" ? 1 : 2;
      expect(values.size).toBeGreaterThanOrEqual(min);
    }
  });

  it("enforces apply_patch availability and canonical names across model/provider constraints", () => {
    const defaultTools = createGreenchClawCodingTools({ config: testConfig, senderIsOwner: true });
    expect(toolNameList(defaultTools)).toContain("exec");
    expect(toolNameList(defaultTools)).toContain("process");
    expect(toolNameList(defaultTools)).not.toContain("apply_patch");

    const openAiTools = createGreenchClawCodingTools({
      config: testConfig,
      modelProvider: "openai",
      modelId: "gpt-5.4",
    });
    expect(toolNameList(openAiTools)).toContain("apply_patch");

    const codexTools = createGreenchClawCodingTools({
      config: testConfig,
      modelProvider: "openai-codex",
      modelId: "gpt-5.4",
    });
    expect(toolNameList(codexTools)).toContain("apply_patch");

    const disabledConfig: GreenchClawConfig = {
      tools: {
        exec: {
          applyPatch: { enabled: false },
        },
      },
    };
    const disabledOpenAiTools = createGreenchClawCodingTools({
      config: disabledConfig,
      modelProvider: "openai",
      modelId: "gpt-5.4",
    });
    expect(toolNameList(disabledOpenAiTools)).not.toContain("apply_patch");

    const anthropicTools = createGreenchClawCodingTools({
      config: disabledConfig,
      modelProvider: "anthropic",
      modelId: "claude-opus-4-6",
    });
    expect(toolNameList(anthropicTools)).not.toContain("apply_patch");

    const allowModelsConfig: GreenchClawConfig = {
      tools: {
        exec: {
          applyPatch: { allowModels: ["gpt-5.4"] },
        },
      },
    };
    const allowed = createGreenchClawCodingTools({
      config: allowModelsConfig,
      modelProvider: "openai",
      modelId: "gpt-5.4",
    });
    expect(toolNameList(allowed)).toContain("apply_patch");

    const denied = createGreenchClawCodingTools({
      config: allowModelsConfig,
      modelProvider: "openai",
      modelId: "gpt-5.4-mini",
    });
    expect(toolNameList(denied)).not.toContain("apply_patch");

    const oauthTools = createGreenchClawCodingTools({
      config: testConfig,
      modelProvider: "anthropic",
      modelAuthMode: "oauth",
    });
    const names = new Set(oauthTools.map((tool) => tool.name));
    expect(names.has("exec")).toBe(true);
    expect(names.has("read")).toBe(true);
    expect(names.has("write")).toBe(true);
    expect(names.has("edit")).toBe(true);
    expect(names.has("apply_patch")).toBe(false);
  });

  it("provides top-level object schemas for all tools", () => {
    const tools = createGreenchClawCodingTools({ config: testConfig });
    const offenders = tools
      .map((tool) => {
        const schema =
          tool.parameters && typeof tool.parameters === "object"
            ? (tool.parameters as Record<string, unknown>)
            : null;
        return {
          name: tool.name,
          type: schema?.type,
          keys: schema ? Object.keys(schema).toSorted() : null,
        };
      })
      .filter((entry) => entry.type !== "object");

    expect(offenders).toStrictEqual([]);
  });

  it("does not expose provider-specific message tools", () => {
    const tools = createGreenchClawCodingTools({ messageProvider: "discord" });
    const names = new Set(tools.map((tool) => tool.name));
    expect(names.has("discord")).toBe(false);
    expect(names.has("slack")).toBe(false);
    expect(names.has("telegram")).toBe(false);
    expect(names.has("whatsapp")).toBe(false);
  });

  it("filters session tools for sub-agent sessions by default", () => {
    const tools = createGreenchClawCodingTools({
      sessionKey: "agent:main:subagent:test",
    });
    const names = new Set(tools.map((tool) => tool.name));
    expect(names.has("sessions_list")).toBe(false);
    expect(names.has("sessions_history")).toBe(false);
    expect(names.has("sessions_send")).toBe(false);
    expect(names.has("sessions_spawn")).toBe(false);
    expect(names.has("subagents")).toBe(false);

    expect(names.has("read")).toBe(true);
    expect(names.has("exec")).toBe(true);
    expect(names.has("process")).toBe(true);
    expect(names.has("apply_patch")).toBe(false);
  });

  it("uses stored spawnDepth to apply leaf tool policy for flat depth-2 session keys", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-depth-policy-"));
    try {
      const storeTemplate = path.join(tmpDir, "sessions-{agentId}.json");
      await writeSessionStore(storeTemplate, "main", {
        "agent:main:subagent:flat": {
          sessionId: "session-flat-depth-2",
          updatedAt: Date.now(),
          spawnDepth: 2,
        },
      });

      const tools = createToolsForStoredSession(storeTemplate, "agent:main:subagent:flat");
      expectNoSubagentControlTools(tools);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies subagent tool policy to ACP children spawned under a subagent envelope", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-acp-subagent-policy-"));
    try {
      const storeTemplate = path.join(tmpDir, "sessions-{agentId}.json");
      await writeSessionStore(storeTemplate, "main", {
        "agent:main:acp:child": {
          sessionId: "session-acp-child",
          updatedAt: Date.now(),
          spawnedBy: "agent:main:subagent:parent",
          spawnDepth: 2,
          subagentRole: "leaf",
          subagentControlScope: "none",
        },
        "agent:main:acp:plain": {
          sessionId: "session-acp-plain",
          updatedAt: Date.now(),
          spawnedBy: "agent:main:main",
        },
        "agent:main:acp:parent": {
          sessionId: "session-acp-parent",
          updatedAt: Date.now(),
          spawnedBy: "agent:main:subagent:parent",
        },
      });
      await writeSessionStore(storeTemplate, "writer", {
        "agent:writer:acp:child": {
          sessionId: "session-acp-cross-agent-child",
          updatedAt: Date.now(),
          spawnedBy: "agent:main:acp:parent",
        },
      });

      const persistedEnvelopeTools = createToolsForStoredSession(
        storeTemplate,
        "agent:main:acp:child",
      );
      expectNoSubagentControlTools(persistedEnvelopeTools);

      const restrictedTools = createToolsForStoredSession(storeTemplate, "agent:main:acp:plain");
      const restrictedNames = new Set(restrictedTools.map((tool) => tool.name));
      expect(restrictedNames.has("sessions_spawn")).toBe(true);
      expect(restrictedNames.has("subagents")).toBe(true);

      const ancestryTools = createToolsForStoredSession(storeTemplate, "agent:writer:acp:child");
      expectNoSubagentControlTools(ancestryTools);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies leaf tool policy for cross-agent subagent sessions when spawnDepth is missing", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-cross-agent-subagent-"));
    try {
      const storeTemplate = path.join(tmpDir, "sessions-{agentId}.json");
      await writeSessionStore(storeTemplate, "main", {
        "agent:main:subagent:parent": {
          sessionId: "session-main-parent",
          updatedAt: Date.now(),
          spawnedBy: "agent:main:main",
        },
      });
      await writeSessionStore(storeTemplate, "writer", {
        "agent:writer:subagent:child": {
          sessionId: "session-writer-child",
          updatedAt: Date.now(),
          spawnedBy: "agent:main:subagent:parent",
        },
      });

      const tools = createToolsForStoredSession(storeTemplate, "agent:writer:subagent:child");
      expectNoSubagentControlTools(tools);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("supports allow-only sub-agent tool policy", () => {
    const tools = createGreenchClawCodingTools({
      sessionKey: "agent:main:subagent:test",
      config: {
        tools: {
          subagents: {
            tools: {
              allow: ["read"],
            },
          },
        },
      },
    });
    expect(tools.map((tool) => tool.name)).toEqual(["read"]);
  });

  it("applies tool profiles before allow/deny policies", () => {
    const tools = createGreenchClawCodingTools({
      config: { tools: { profile: "messaging" } },
    });
    const names = new Set(tools.map((tool) => tool.name));
    expect(names.has("message")).toBe(true);
    expect(names.has("sessions_send")).toBe(true);
    expect(names.has("sessions_spawn")).toBe(false);
    expect(names.has("exec")).toBe(false);
    expect(names.has("browser")).toBe(false);
  });

  it("includes browser tool with full profile when browser is configured (#76507)", () => {
    const tools = createGreenchClawCodingTools({
      config: {
        tools: { profile: "full" },
        browser: { enabled: true },
        plugins: { entries: { browser: { enabled: true } } },
      } as GreenchClawConfig,
      senderIsOwner: true,
    });
    const names = new Set(tools.map((tool) => tool.name));
    // full profile must not filter any tools — browser, canvas, etc. must be present.
    expect(names.has("browser")).toBe(true);
    expect(names.has("canvas")).toBe(true);
    expect(names.has("exec")).toBe(true);
    expect(names.has("message")).toBe(true);
  });

  it("includes browser tool with full profile for non-owner senders (#76507)", () => {
    const tools = createGreenchClawCodingTools({
      config: {
        tools: { profile: "full" },
        browser: { enabled: true },
        plugins: { entries: { browser: { enabled: true } } },
      } as GreenchClawConfig,
      senderIsOwner: false,
    });
    const names = new Set(tools.map((tool) => tool.name));
    // browser is NOT owner-only; it must be available to non-owner senders.
    expect(names.has("browser")).toBe(true);
    expect(names.has("canvas")).toBe(true);
    // owner-only tools should be filtered for non-owners
    expect(names.has("gateway")).toBe(false);
    expect(names.has("cron")).toBe(false);
    expect(names.has("nodes")).toBe(false);
  });

  it("includes browser tool without explicit profile (defaults to no filtering) (#76507)", () => {
    const tools = createGreenchClawCodingTools({
      config: {
        browser: { enabled: true },
        plugins: { entries: { browser: { enabled: true } } },
      } as GreenchClawConfig,
    });
    const names = new Set(tools.map((tool) => tool.name));
    // No profile means no profile filtering — all tools pass.
    expect(names.has("browser")).toBe(true);
  });

  it("keeps browser out of coding-profile subagents unless profile-stage alsoAllow adds it", () => {
    const baseConfig = {
      browser: { enabled: true },
      plugins: { entries: { browser: { enabled: true } } },
      tools: { profile: "coding" },
    } as GreenchClawConfig;
    const codingSubagent = createGreenchClawCodingTools({
      sessionKey: "agent:main:subagent:test",
      config: baseConfig,
    });
    const codingNames = new Set(codingSubagent.map((tool) => tool.name));
    expect(codingNames.has("browser")).toBe(false);

    const subagentAllowOnly = createGreenchClawCodingTools({
      sessionKey: "agent:main:subagent:test",
      config: {
        ...baseConfig,
        tools: {
          profile: "coding",
          subagents: { tools: { allow: ["browser"] } },
        },
      } as GreenchClawConfig,
    });
    expect(toolNameList(subagentAllowOnly)).not.toContain("browser");

    const profileStageAlsoAllow = createGreenchClawCodingTools({
      sessionKey: "agent:main:subagent:test",
      config: {
        ...baseConfig,
        tools: { profile: "coding", alsoAllow: ["browser"] },
      } as GreenchClawConfig,
    });
    expect(toolNameList(profileStageAlsoAllow)).toContain("browser");
  });

  it("can keep message available when a cron route needs it under the coding profile", () => {
    const codingTools = createGreenchClawCodingTools({
      config: { tools: { profile: "coding" } },
    });
    expect(toolNameList(codingTools)).not.toContain("message");

    const cronTools = createGreenchClawCodingTools({
      config: { tools: { profile: "coding" } },
      forceMessageTool: true,
    });
    expect(toolNameList(cronTools)).toContain("message");
  });

  it("keeps heartbeat response available for heartbeat runs under the coding profile", () => {
    const codingTools = createGreenchClawCodingTools({
      config: { tools: { profile: "coding" } },
      trigger: "heartbeat",
      enableHeartbeatTool: true,
      forceHeartbeatTool: true,
    });

    expect(toolNameList(codingTools)).toContain("heartbeat_respond");
  });

  it("enables heartbeat response when visible replies are message-tool-only", () => {
    const tools = createGreenchClawCodingTools({
      config: {
        messages: { visibleReplies: "message_tool" },
        tools: { profile: "coding" },
      } as GreenchClawConfig,
      trigger: "heartbeat",
    });

    expect(toolNameList(tools)).toContain("heartbeat_respond");
  });

  it("can keep message available when a cron route needs it under a provider coding profile", () => {
    const providerProfileTools = createGreenchClawCodingTools({
      config: { tools: { byProvider: { openai: { profile: "coding" } } } },
      modelProvider: "openai",
      modelId: "gpt-5.4",
    });
    expect(toolNameList(providerProfileTools)).not.toContain("message");

    const cronTools = createGreenchClawCodingTools({
      config: { tools: { byProvider: { openai: { profile: "coding" } } } },
      modelProvider: "openai",
      modelId: "gpt-5.4",
      forceMessageTool: true,
    });
    expect(toolNameList(cronTools)).toContain("message");
  });

  it.each(providerAliasCases)(
    "applies canonical tools.byProvider deny policy to core tools for alias %s",
    (alias, canonical) => {
      const tools = createGreenchClawCodingTools({
        config: {
          tools: {
            byProvider: {
              [canonical]: { deny: ["read"] },
            },
          },
        } as GreenchClawConfig,
        modelProvider: alias,
      });
      const names = new Set(tools.map((tool) => tool.name));

      expect(names.has("read")).toBe(false);
      expect(names.has("write")).toBe(true);
    },
  );

  it("expands group shorthands in global tool policy", () => {
    const tools = createGreenchClawCodingTools({
      config: { tools: { allow: ["group:fs"] } },
    });
    const names = new Set(tools.map((tool) => tool.name));
    expect(names.has("read")).toBe(true);
    expect(names.has("write")).toBe(true);
    expect(names.has("edit")).toBe(true);
    expect(names.has("exec")).toBe(false);
    expect(names.has("browser")).toBe(false);
  });

  it("expands group shorthands in global tool deny policy", () => {
    const tools = createGreenchClawCodingTools({
      config: { tools: { deny: ["group:fs"] } },
    });
    const names = new Set(tools.map((tool) => tool.name));
    expect(names.has("read")).toBe(false);
    expect(names.has("write")).toBe(false);
    expect(names.has("edit")).toBe(false);
    expect(names.has("exec")).toBe(true);
  });

  it("lets agent profiles override global profiles", () => {
    const tools = createGreenchClawCodingTools({
      sessionKey: "agent:work:main",
      config: {
        tools: { profile: "coding" },
        agents: {
          list: [{ id: "work", tools: { profile: "messaging" } }],
        },
      },
    });
    const names = new Set(tools.map((tool) => tool.name));
    expect(names.has("message")).toBe(true);
    expect(names.has("exec")).toBe(false);
    expect(names.has("read")).toBe(false);
  });

  it("removes unsupported JSON Schema keywords for Cloud Code Assist API compatibility", () => {
    const googleTools = createGreenchClawCodingTools({
      modelProvider: "google",
      senderIsOwner: true,
    });
    for (const tool of googleTools) {
      const violations = findUnsupportedSchemaKeywords(
        tool.parameters,
        `${tool.name}.parameters`,
        GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS,
      );
      expect(violations).toStrictEqual([]);
    }
  });

  it("applies xai model compat for direct Grok tool cleanup", () => {
    const xaiTools = createGreenchClawCodingTools({
      modelProvider: "xai",
      modelCompat: {
        toolSchemaProfile: "xai",
        unsupportedToolSchemaKeywords: Array.from(XAI_UNSUPPORTED_SCHEMA_KEYWORDS),
        nativeWebSearchTool: true,
        toolCallArgumentsEncoding: "html-entities",
      },
      senderIsOwner: true,
    });

    expect(toolNameList(xaiTools)).not.toContain("web_search");
    for (const tool of xaiTools) {
      const violations = findUnsupportedSchemaKeywords(
        tool.parameters,
        `${tool.name}.parameters`,
        XAI_UNSUPPORTED_SCHEMA_KEYWORDS,
      );
      expect(
        violations.filter((violation) => {
          const keyword = violation.split(".").at(-1) ?? "";
          return XAI_UNSUPPORTED_SCHEMA_KEYWORDS.has(keyword);
        }),
      ).toStrictEqual([]);
    }
  });

  it("returns image-aware read metadata for images and text-only blocks for text files", async () => {
    const defaultTools = createGreenchClawCodingTools();
    const readTool = requireTool(defaultTools, "read");
    const readExecute = requireToolExecute(readTool);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-read-"));
    try {
      const imagePath = path.join(tmpDir, "sample.png");
      await fs.writeFile(imagePath, tinyPngBuffer);

      const imageResult = await readExecute("tool-1", {
        path: imagePath,
      });

      const imageBlocks = imageResult?.content?.filter((block) => block.type === "image") as
        | Array<{ mimeType?: string }>
        | undefined;
      const imageTextBlocks = imageResult?.content?.filter((block) => block.type === "text") as
        | Array<{ text?: string }>
        | undefined;
      const imageText = imageTextBlocks?.map((block) => block.text ?? "").join("\n") ?? "";
      expect(imageText).toContain("Read image file [image/png]");
      if ((imageBlocks?.length ?? 0) > 0) {
        expect(imageBlocks?.every((block) => block.mimeType === "image/png")).toBe(true);
      } else {
        expect(imageText).toContain("[Image omitted:");
      }

      const textPath = path.join(tmpDir, "sample.txt");
      const contents = "Hello from GreenchClaw read tool.";
      await fs.writeFile(textPath, contents, "utf8");

      const textResult = await readExecute("tool-2", {
        path: textPath,
      });

      expect(textResult?.content).toEqual([{ type: "text", text: contents }]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("filters tools by sandbox policy", () => {
    const sandboxDir = path.join(os.tmpdir(), "GreenchClaw-sandbox");
    const sandbox = createPiToolsSandboxContext({
      workspaceDir: sandboxDir,
      agentWorkspaceDir: path.join(os.tmpdir(), "GreenchClaw-workspace"),
      workspaceAccess: "none" as const,
      fsBridge: createHostSandboxFsBridge(sandboxDir),
      tools: {
        allow: ["bash"],
        deny: ["browser"],
      },
    });
    const tools = createGreenchClawCodingTools({ sandbox });
    expect(toolNameList(tools)).toContain("exec");
    expect(toolNameList(tools)).not.toContain("read");
    expect(toolNameList(tools)).not.toContain("browser");
  });

  it("hard-disables write/edit when sandbox workspaceAccess is ro", () => {
    const sandboxDir = path.join(os.tmpdir(), "GreenchClaw-sandbox");
    const sandbox = createPiToolsSandboxContext({
      workspaceDir: sandboxDir,
      agentWorkspaceDir: path.join(os.tmpdir(), "GreenchClaw-workspace"),
      workspaceAccess: "ro" as const,
      fsBridge: createHostSandboxFsBridge(sandboxDir),
      tools: {
        allow: ["read", "write", "edit"],
        deny: [],
      },
    });
    const tools = createGreenchClawCodingTools({ sandbox });
    expect(toolNameList(tools)).toContain("read");
    expect(toolNameList(tools)).not.toContain("write");
    expect(toolNameList(tools)).not.toContain("edit");
  });

  it("accepts canonical parameters for read/write/edit", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-canonical-"));
    try {
      const tools = createGreenchClawCodingTools({ workspaceDir: tmpDir });
      const { readTool, writeTool, editTool } = expectReadWriteEditTools(tools);

      const filePath = "canonical-test.txt";
      await writeTool?.execute("tool-canonical-1", {
        path: filePath,
        content: "hello world",
      });

      await editTool?.execute("tool-canonical-2", {
        path: filePath,
        edits: [{ oldText: "world", newText: "universe" }],
      });

      const result = await readTool?.execute("tool-canonical-3", {
        path: filePath,
      });

      const textBlocks = result?.content?.filter((block) => block.type === "text") as
        | Array<{ text?: string }>
        | undefined;
      const combinedText = textBlocks?.map((block) => block.text ?? "").join("\n");
      expect(combinedText).toContain("hello universe");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects legacy alias parameters", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-legacy-alias-"));
    try {
      const tools = createGreenchClawCodingTools({ workspaceDir: tmpDir });
      const { readTool, writeTool, editTool } = expectReadWriteEditTools(tools);

      await expect(
        writeTool?.execute("tool-legacy-write", {
          file: "legacy.txt",
          content: "hello old value",
        }),
      ).rejects.toThrow(/Missing required parameter: path/);

      await expect(
        editTool?.execute("tool-legacy-edit", {
          filePath: "legacy.txt",
          old_text: "old",
          newString: "new",
        }),
      ).rejects.toThrow(/Missing required parameters: path, edits/);

      await expect(
        readTool?.execute("tool-legacy-read", {
          file_path: "legacy.txt",
        }),
      ).rejects.toThrow(/Missing required parameter: path/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects structured content blocks for write", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-structured-write-"));
    try {
      const tools = createGreenchClawCodingTools({ workspaceDir: tmpDir });
      const writeTool = requireTool(tools, "write");
      const writeExecute = requireToolExecute(writeTool);

      await expect(
        writeExecute("tool-structured-write", {
          path: "structured-write.js",
          content: [
            { type: "text", text: "const path = require('path');\n" },
            { type: "input_text", text: "const root = path.join(process.env.HOME, 'clawd');\n" },
          ],
        }),
      ).rejects.toThrow(/Missing required parameter: content/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects structured edit payloads", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-structured-edit-"));
    try {
      const filePath = path.join(tmpDir, "structured-edit.js");
      await fs.writeFile(filePath, "const value = 'old';\n", "utf8");

      const tools = createGreenchClawCodingTools({ workspaceDir: tmpDir });
      const editTool = requireTool(tools, "edit");
      const editExecute = requireToolExecute(editTool);

      await expect(
        editExecute("tool-structured-edit", {
          path: "structured-edit.js",
          edits: [
            {
              oldText: [{ type: "text", text: "old" }],
              newText: [{ kind: "text", value: "new" }],
            },
          ],
        }),
      ).rejects.toThrow(/Missing required parameter: edits/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
