import {
  jsonResult,
  resolveMemorySearchConfig,
  resolveSessionAgentIds,
  type MemoryPluginRuntime,
  type GreenchClawConfig,
} from "GreenchClaw/plugin-sdk/memory-core-host-runtime-core";
import { resolveMemoryBackendConfig } from "GreenchClaw/plugin-sdk/memory-core-host-runtime-files";
import {
  definePluginEntry,
  type AnyAgentTool,
  type GreenchClawPluginToolContext,
} from "GreenchClaw/plugin-sdk/plugin-entry";
import type { TSchema } from "typebox";
import { registerShortTermPromotionDreaming } from "./src/dreaming.js";
import { startFactsExtractionRunner, stopFactsExtractionRunner } from "./src/facts-extraction.js";
import { buildFactsPromptSupplement } from "./src/facts-prompt-supplement.js";
import { buildMemoryFlushPlan } from "./src/flush-plan.js";
import { registerBuiltInMemoryEmbeddingProviders } from "./src/memory/provider-adapters.js";
import { buildPromptSection } from "./src/prompt-section.js";

type MemoryToolsModule = typeof import("./src/tools.js");
type RuntimeProviderModule = typeof import("./src/runtime-provider.js");

type MemoryToolOptions = {
  config?: GreenchClawConfig;
  getConfig?: () => GreenchClawConfig | undefined;
  agentId?: string;
  agentSessionKey?: string;
  sandboxed?: boolean;
};

let memoryToolsModulePromise: Promise<MemoryToolsModule> | undefined;
let runtimeProviderModulePromise: Promise<RuntimeProviderModule> | undefined;

function loadMemoryToolsModule(): Promise<MemoryToolsModule> {
  memoryToolsModulePromise ??= import("./src/tools.js");
  return memoryToolsModulePromise;
}

function loadRuntimeProviderModule(): Promise<RuntimeProviderModule> {
  runtimeProviderModulePromise ??= import("./src/runtime-provider.js");
  return runtimeProviderModulePromise;
}

function getToolConfig(options: MemoryToolOptions): GreenchClawConfig | undefined {
  return options.getConfig?.() ?? options.config;
}

function hasMemoryToolContext(options: MemoryToolOptions): boolean {
  const cfg = getToolConfig(options);
  if (!cfg) {
    return false;
  }
  const { sessionAgentId: agentId } = resolveSessionAgentIds({
    sessionKey: options.agentSessionKey,
    config: cfg,
    agentId: options.agentId,
  });
  return Boolean(resolveMemorySearchConfig(cfg, agentId));
}

const MemorySearchSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    maxResults: { type: "number" },
    minScore: { type: "number" },
    corpus: { type: "string", enum: ["memory", "wiki", "all", "sessions"] },
  },
  required: ["query"],
  additionalProperties: false,
} as const satisfies TSchema;

const MemoryGetSchema = {
  type: "object",
  properties: {
    path: { type: "string" },
    from: { type: "number" },
    lines: { type: "number" },
    corpus: { type: "string", enum: ["memory", "wiki", "all"] },
  },
  required: ["path"],
  additionalProperties: false,
} as const satisfies TSchema;

function createLazyMemoryTool(params: {
  options: MemoryToolOptions;
  label: string;
  name: "memory_search" | "memory_get";
  description: string;
  parameters: typeof MemorySearchSchema | typeof MemoryGetSchema;
  load: (module: MemoryToolsModule, options: MemoryToolOptions) => AnyAgentTool | null;
}): AnyAgentTool | null {
  if (!hasMemoryToolContext(params.options)) {
    return null;
  }

  let toolPromise: Promise<AnyAgentTool | null> | undefined;
  const loadTool = async () => {
    toolPromise ??= loadMemoryToolsModule().then((module) => params.load(module, params.options));
    return await toolPromise;
  };

  return {
    label: params.label,
    name: params.name,
    description: params.description,
    parameters: params.parameters,
    execute: async (toolCallId, toolParams, signal, onUpdate) => {
      const tool = await loadTool();
      if (!tool) {
        return jsonResult({
          disabled: true,
          unavailable: true,
          error: "memory search unavailable",
        });
      }
      return await tool.execute(toolCallId, toolParams, signal, onUpdate);
    },
  };
}

function createLazyMemorySearchTool(options: MemoryToolOptions): AnyAgentTool | null {
  return createLazyMemoryTool({
    options,
    label: "Memory Search",
    name: "memory_search",
    description:
      "Mandatory recall step: semantically search MEMORY.md + memory/*.md (and optional session transcripts) before answering questions about prior work, decisions, dates, people, preferences, or todos. Optional `corpus=wiki` or `corpus=all` also searches registered compiled-wiki supplements. `corpus=memory` restricts hits to indexed memory files (excludes session transcript chunks from ranking). `corpus=sessions` restricts hits to indexed session transcripts (same visibility rules as session history tools). If response has disabled=true, memory retrieval is unavailable and should be surfaced to the user.",
    parameters: MemorySearchSchema,
    load: (module, loadOptions) => module.createMemorySearchTool(loadOptions),
  });
}

function createLazyMemoryGetTool(options: MemoryToolOptions): AnyAgentTool | null {
  return createLazyMemoryTool({
    options,
    label: "Memory Get",
    name: "memory_get",
    description:
      "Safe exact excerpt read from MEMORY.md or memory/*.md. Defaults to a bounded excerpt when lines are omitted, includes truncation/continuation info when more content exists, and `corpus=wiki` reads from registered compiled-wiki supplements.",
    parameters: MemoryGetSchema,
    load: (module, loadOptions) => module.createMemoryGetTool(loadOptions),
  });
}

function resolveMemoryToolOptions(ctx: GreenchClawPluginToolContext): MemoryToolOptions {
  const getConfig = () => ctx.getRuntimeConfig?.() ?? ctx.runtimeConfig ?? ctx.config;
  return {
    config: getConfig(),
    getConfig,
    agentId: ctx.agentId,
    agentSessionKey: ctx.sessionKey,
    sandboxed: ctx.sandboxed,
  };
}

const memoryRuntime: MemoryPluginRuntime = {
  async getMemorySearchManager(params) {
    const { memoryRuntime: runtime } = await loadRuntimeProviderModule();
    return await runtime.getMemorySearchManager(params);
  },
  resolveMemoryBackendConfig(params) {
    return resolveMemoryBackendConfig(params);
  },
  async closeAllMemorySearchManagers() {
    const { memoryRuntime: runtime } = await loadRuntimeProviderModule();
    await runtime.closeAllMemorySearchManagers?.();
    stopFactsExtractionRunner();
  },
};
export default definePluginEntry({
  id: "memory-core",
  name: "Memory (Core)",
  description: "File-backed memory search tools and CLI",
  kind: "memory",
  register(api) {
    registerBuiltInMemoryEmbeddingProviders(api);
    registerShortTermPromotionDreaming(api);
    startFactsExtractionRunner({
      cfg: api.config as GreenchClawConfig,
      logger: api.logger,
      getConfig: () => (api.runtime.config?.current?.() ?? api.config) as GreenchClawConfig,
    });
    api.registerMemoryCapability({
      promptBuilder: buildPromptSection,
      flushPlanResolver: buildMemoryFlushPlan,
      runtime: memoryRuntime,
      publicArtifacts: {
        async listArtifacts(params) {
          const { listMemoryCorePublicArtifacts } = await import("./src/public-artifacts.js");
          return await listMemoryCorePublicArtifacts(params);
        },
      },
    });

    // Facts supplement — registered with "zz-" prefix so it sorts last
    // after all other memory prompt supplements.
    api.registerMemoryPromptSupplement("zz-facts", buildFactsPromptSupplement);

    api.registerTool((ctx) => createLazyMemorySearchTool(resolveMemoryToolOptions(ctx)), {
      names: ["memory_search"],
    });

    api.registerTool((ctx) => createLazyMemoryGetTool(resolveMemoryToolOptions(ctx)), {
      names: ["memory_get"],
    });

    api.registerCommand({
      name: "dreaming",
      description: "Enable or disable memory dreaming.",
      acceptsArgs: true,
      handler: async (ctx) => {
        const { handleDreamingCommand } = await import("./src/dreaming-command.js");
        return await handleDreamingCommand(api, ctx);
      },
    });

    api.registerCli(
      async ({ program }) => {
        const { registerMemoryCli } = await import("./src/cli.js");
        registerMemoryCli(program);
      },
      {
        descriptors: [
          {
            name: "memory",
            description: "Search, inspect, and reindex memory files",
            hasSubcommands: true,
          },
        ],
      },
    );
  },
});
