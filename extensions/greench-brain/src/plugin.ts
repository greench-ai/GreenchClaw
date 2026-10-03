/**
 * GreenchBrain — semantic memory brain using Qdrant.
 *
 * Tools: brain_add | brain_search | brain_list | brain_delete
 */

import crypto from "node:crypto";
import {
  definePluginEntry,
  type GreenchClawPluginApi,
  type AnyAgentTool,
} from "GreenchClaw/plugin-sdk/plugin-entry";

// ── Config ───────────────────────────────────────────────────────────────────

interface BrainConfig {
  qdrantHost: string;
  qdrantPort: number;
  ollamaUrl: string;
  embeddingModel: string;
  collection: string;
}

// Vector dimensionality for the configured embedding model.
// qwen3-embedding:0.6b = 1024. Change here if the embed model changes.
const EMBEDDING_DIMS = 1024;

const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  qdrantHost: "localhost",
  qdrantPort: 6333,
  ollamaUrl: "http://localhost:11434",
  embeddingModel: "nomic-embed-text:v1.5",
  collection: "greench_brain",
};

function getBrainConfig(api: GreenchClawPluginApi): BrainConfig {
  const raw = (api.config.plugins?.entries as Record<string, unknown> | undefined)?.[
    "greench-brain"
  ];
  const cfg = (
    raw && typeof raw === "object" && "config" in raw
      ? (raw as { config: Record<string, unknown> }).config
      : raw
  ) as Record<string, unknown> | undefined;
  return {
    qdrantHost: (cfg?.qdrantHost as string) ?? DEFAULT_BRAIN_CONFIG.qdrantHost,
    qdrantPort: Number(cfg?.qdrantPort ?? DEFAULT_BRAIN_CONFIG.qdrantPort),
    ollamaUrl: (cfg?.ollamaUrl as string) ?? DEFAULT_BRAIN_CONFIG.ollamaUrl,
    embeddingModel: (cfg?.embeddingModel as string) ?? DEFAULT_BRAIN_CONFIG.embeddingModel,
    collection: (cfg?.collection as string) ?? DEFAULT_BRAIN_CONFIG.collection,
  };
}

// ── Ollama Embedding ─────────────────────────────────────────────────────────

async function embedText(text: string, baseUrl: string, model: string): Promise<number[]> {
  const resp = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {throw new Error(`Embedding failed: ${resp.status}`);}
  const data = (await resp.json()) as { embeddings?: number[][] };
  return data.embeddings?.[0] ?? [];
}

// ── Qdrant REST API ──────────────────────────────────────────────────────────

function qdrantUrl(cfg: BrainConfig, path: string): string {
  return `http://${cfg.qdrantHost}:${cfg.qdrantPort}${path}`;
}

async function qdrantRequest<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const resp = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers as Record<string, string> | undefined) },
  });
  if (!resp.ok) {throw new Error(`Qdrant ${resp.status}: ${await resp.text().catch(() => "")}`);}
  return resp.json() as Promise<T>;
}

async function ensureBrainCollection(cfg: BrainConfig): Promise<void> {
  try {
    const data = await qdrantRequest<{ collections: Array<{ name: string }> }>(
      qdrantUrl(cfg, "/collections"),
    );
    if (!data.collections.some((c) => c.name === cfg.collection)) {
      await qdrantRequest(qdrantUrl(cfg, `/collections/${cfg.collection}`), {
        method: "PUT",
        body: JSON.stringify({ vectors: { size: EMBEDDING_DIMS, distance: "Cosine" } }),
      });
    }
  } catch {
    // May already exist
  }
}

async function brainUpsert(
  cfg: BrainConfig,
  point: {
    id: number;
    vector: number[];
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await ensureBrainCollection(cfg);
  await qdrantRequest(qdrantUrl(cfg, `/collections/${cfg.collection}/points`), {
    method: "PUT",
    body: JSON.stringify({ points: [point] }),
  });
}

async function doBrainSearch(
  cfg: BrainConfig,
  queryVector: number[],
  userId: string,
  limit: number,
) {
  await ensureBrainCollection(cfg);
  const data = await qdrantRequest<{
    result: Array<{ id: number; score: number; payload: Record<string, unknown> }>;
  }>(qdrantUrl(cfg, `/collections/${cfg.collection}/points/query`), {
    method: "POST",
    body: JSON.stringify({
      query: queryVector,
      limit,
      filter: { must: [{ key: "user_id", match: { value: userId } }] },
    }),
  });
  return data.result ?? [];
}

async function brainFetchAll(cfg: BrainConfig, userId: string, limit: number) {
  await ensureBrainCollection(cfg);
  const data = await qdrantRequest<{
    result: Array<{ id: number; score: number; payload: Record<string, unknown> }>;
  }>(qdrantUrl(cfg, `/collections/${cfg.collection}/points/query`), {
    method: "POST",
    body: JSON.stringify({
      query: Array.from({ length: 768 }, () => 0),
      limit,
      filter: { must: [{ key: "user_id", match: { value: userId } }] },
    }),
  });
  return data.result ?? [];
}

async function brainDeletePoint(cfg: BrainConfig, pointId: number): Promise<void> {
  await qdrantRequest(qdrantUrl(cfg, `/collections/${cfg.collection}/points/delete`), {
    method: "POST",
    body: JSON.stringify({ points: [pointId] }),
  });
}

// ── Brain Operations ─────────────────────────────────────────────────────────

async function brainAddMemory(
  api: GreenchClawPluginApi,
  text: string,
  userId: string = "default",
  metadata: Record<string, unknown> = {},
): Promise<{ memory_id: string }> {
  const cfg = getBrainConfig(api);
  const memoryId = crypto.randomUUID();
  const vector = await embedText(text, cfg.ollamaUrl, cfg.embeddingModel);

  await brainUpsert(cfg, {
    id: Math.abs(
      Number.parseInt(crypto.createHash("sha1").update(memoryId).digest("hex").slice(0, 12), 16),
    ),
    vector,
    payload: {
      memory_id: memoryId,
      user_id: userId,
      text,
      metadata,
      created_at: new Date().toISOString(),
    },
  });

  return { memory_id: memoryId };
}

async function brainSearch(
  api: GreenchClawPluginApi,
  query: string,
  userId: string = "default",
  limit: number = 10,
) {
  const cfg = getBrainConfig(api);
  const queryVector = await embedText(query, cfg.ollamaUrl, cfg.embeddingModel);
  const results = await doBrainSearch(cfg, queryVector, userId, limit);
  return results.map((r) => ({
    memory_id: (r.payload.memory_id as string) ?? "",
    text: (r.payload.text as string) ?? "",
    score: r.score,
    metadata: (r.payload.metadata as Record<string, unknown>) ?? {},
    created_at: (r.payload.created_at as string) ?? "",
  }));
}

async function brainGetAll(
  api: GreenchClawPluginApi,
  userId: string = "default",
  limit: number = 100,
) {
  const cfg = getBrainConfig(api);
  const results = await brainFetchAll(cfg, userId, limit);
  return results.map((r) => ({
    memory_id: (r.payload.memory_id as string) ?? "",
    text: (r.payload.text as string) ?? "",
    metadata: (r.payload.metadata as Record<string, unknown>) ?? {},
    created_at: (r.payload.created_at as string) ?? "",
  }));
}

async function brainDeleteMemory(
  api: GreenchClawPluginApi,
  memoryId: string,
): Promise<boolean> {
  const cfg = getBrainConfig(api);
  const pointId = Math.abs(
    Number.parseInt(crypto.createHash("sha1").update(memoryId).digest("hex").slice(0, 12), 16),
  );
  try {
    await brainDeletePoint(cfg, pointId);
    return true;
  } catch {
    return false;
  }
}

// ── Plugin Entry ─────────────────────────────────────────────────────────────

export default definePluginEntry({
  id: "greench-brain",
  name: "GreenchBrain",
  description: "Semantic memory brain — persistent, searchable memory using Qdrant.",
  register(api: GreenchClawPluginApi) {
    type ToolParams = {
      type: "object";
      properties?: Record<string, unknown>;
      required?: string[];
    };
    const defTool = (
      name: string,
      label: string,
      description: string,
      parameters: ToolParams,
      execute: (
        params: Record<string, unknown>,
      ) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>,
    ): AnyAgentTool =>
      ({
        name,
        label,
        description,
        parameters,
        execute: async (_toolCallId: string, toolParams: unknown) =>
          execute((toolParams ?? {}) as Record<string, unknown>),
      }) as unknown as AnyAgentTool;

    api.registerTool(
      () =>
        defTool(
          "brain_add",
          "Brain Add",
          "Add a memory to the brain.",
          {
            type: "object",
            properties: {
              text: { type: "string" },
              user_id: { type: "string", default: "default" },
              metadata: { type: "object", additionalProperties: true },
            },
            required: ["text"],
          },
          async (params) => {
            try {
              const result = await brainAddMemory(
                api,
                (params.text as string) ?? "",
                (params.user_id as string) ?? "default",
                (params.metadata as Record<string, unknown>) ?? {},
              );
              return {
                content: [{ type: "text" as const, text: `Memory added: ${result.memory_id}` }],
              };
            } catch (err) {
              return {
                content: [{ type: "text" as const, text: `Failed: ${String(err)}` }],
                isError: true,
              };
            }
          },
        ),
      { names: ["brain_add"] },
    );

    api.registerTool(
      () =>
        defTool(
          "brain_search",
          "Brain Search",
          "Search the brain for relevant memories.",
          {
            type: "object",
            properties: {
              query: { type: "string" },
              user_id: { type: "string" },
              limit: { type: "number" },
            },
            required: ["query"],
          },
          async (params) => {
            try {
              const results = await brainSearch(
                api,
                (params.query as string) ?? "",
                (params.user_id as string) ?? "default",
                Number(params.limit ?? 10),
              );
              if (!results.length)
                {return { content: [{ type: "text" as const, text: "No memories found." }] };}
              const lines = results.map(
                (r, i) =>
                  `[${i + 1}] (score: ${r.score.toFixed(3)}) ${r.text}${Object.keys(r.metadata).length ? ` | ${JSON.stringify(r.metadata)}` : ""}`,
              );
              return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
            } catch (err) {
              return {
                content: [{ type: "text" as const, text: `Search failed: ${String(err)}` }],
                isError: true,
              };
            }
          },
        ),
      { names: ["brain_search"] },
    );

    api.registerTool(
      () =>
        defTool(
          "brain_list",
          "Brain List",
          "List all memories in the brain.",
          {
            type: "object",
            properties: { user_id: { type: "string" }, limit: { type: "number" } },
          },
          async (params) => {
            try {
              const memories = await brainGetAll(
                api,
                (params.user_id as string) ?? "default",
                Number(params.limit ?? 100),
              );
              if (!memories.length)
                {return { content: [{ type: "text" as const, text: "No memories stored." }] };}
              return {
                content: [
                  {
                    type: "text" as const,
                    text: memories.map((m, i) => `[${i + 1}] ${m.text}`).join("\n"),
                  },
                ],
              };
            } catch (err) {
              return {
                content: [{ type: "text" as const, text: `List failed: ${String(err)}` }],
                isError: true,
              };
            }
          },
        ),
      { names: ["brain_list"] },
    );

    api.registerTool(
      () =>
        defTool(
          "brain_delete",
          "Brain Delete",
          "Delete a specific memory by ID.",
          {
            type: "object",
            properties: { memory_id: { type: "string" }, user_id: { type: "string" } },
            required: ["memory_id"],
          },
          async (params) => {
            try {
              const deleted = await brainDeleteMemory(api, String(params.memory_id));
              return {
                content: [
                  {
                    type: "text" as const,
                    text: deleted ? `Deleted "${params.memory_id as string}".` : "Not found.",
                  },
                ],
              };
            } catch (err) {
              return {
                content: [{ type: "text" as const, text: `Delete failed: ${String(err)}` }],
                isError: true,
              };
            }
          },
        ),
      { names: ["brain_delete"] },
    );

    api.logger.info?.("greench-brain: registered");
  },
});
