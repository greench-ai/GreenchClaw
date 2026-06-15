/**
 * GreenchRAG — document RAG pipeline.
 *
 * Tools (registered synchronously, execute lazily):
 *   rag_index   — parse + chunk + embed + store a document
 *   rag_search  — semantic search across indexed documents
 *   rag_list    — list indexed documents
 *   rag_delete  — remove a document from the index
 */

import { definePluginEntry, type GreenchClawPluginApi } from "GreenchClaw/plugin-sdk/plugin-entry";

// ── RAG Config ────────────────────────────────────────────────────────────────

interface RAGConfig {
  qdrant: { host: string; port: number; collection: string };
  ollama: { baseUrl: string; embeddingModel: string };
  chunking: { chunkSize: number; chunkOverlap: number };
}

const EMBEDDING_DIMS = 768;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function getRAGConfig(api: GreenchClawPluginApi): RAGConfig {
  const raw = (api.config.plugins?.entries as Record<string, unknown> | undefined)?.["greench-rag"];
  const cfg = (
    raw && typeof raw === "object" && "config" in raw
      ? (raw as { config: Record<string, unknown> }).config
      : raw
  ) as Record<string, unknown> | undefined;
  return {
    qdrant: {
      host: String(cfg?.qdrant?.host ?? "localhost"),
      port: Number(cfg?.qdrant?.port ?? 6333),
      collection: String(cfg?.qdrant?.collection ?? "greench_documents"),
    },
    ollama: {
      baseUrl: String(cfg?.ollama?.baseUrl ?? "http://localhost:11434"),
      embeddingModel: String(cfg?.ollama?.embeddingModel ?? "nomic-embed-text:v1.5"),
    },
    chunking: {
      chunkSize: Number(cfg?.chunking?.chunkSize ?? 500),
      chunkOverlap: Number(cfg?.chunking?.chunkOverlap ?? 100),
    },
  };
}

// ── Document Parsing ─────────────────────────────────────────────────────────

async function parseDocument(buffer: Buffer, fileType: string): Promise<string> {
  if (fileType === "pdf") {
    const { getDocument } = await import("pdfjs-dist");
    const data = new Uint8Array(buffer);
    const pdf = await getDocument({ data }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((item: { str?: string }) => item.str ?? "").join(" "));
    }
    return parts.join("\n\n");
  } else if (fileType === "docx" || fileType === "doc") {
    const { extractSingleImage } = await import("mammoth");
    const result = await extractSingleImage({ buffer });
    return result.value;
  } else {
    return buffer.toString("utf-8");
  }
}

// ── Chunking ─────────────────────────────────────────────────────────────────

interface Chunk {
  text: string;
  chunk_id: string;
}

function chunkText(text: string, chunkSize: number, chunkOverlap: number): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let id = 0;
  while (start < text.length) {
    const end = start + chunkSize;
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push({ text: chunk, chunk_id: `chunk_${id++}` });
    start += chunkSize - chunkOverlap;
  }
  return chunks;
}

// ── Ollama Embedding ────────────────────────────────────────────────────────

async function embedTexts(texts: string[], baseUrl: string, model: string): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const resp = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) throw new Error(`Embedding failed: ${resp.status}`);
    const data = (await resp.json()) as { embedding?: number[] };
    results.push(data.embedding ?? []);
    if (results[results.length - 1].length !== EMBEDDING_DIMS) {
      // Pad or truncate to expected dimensions
      const vec = results[results.length - 1];
      while (vec.length < EMBEDDING_DIMS) vec.push(0);
      if (vec.length > EMBEDDING_DIMS) vec.length = EMBEDDING_DIMS;
    }
  }
  return results;
}

// ── Qdrant REST API ─────────────────────────────────────────────────────────

function qdrantUrl(cfg: RAGConfig, path: string): string {
  return `http://${cfg.qdrant.host}:${cfg.qdrant.port}${path}`;
}

async function qdrantRequest<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const resp = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  if (!resp.ok) throw new Error(`Qdrant ${resp.status}: ${await resp.text().catch(() => "")}`);
  return resp.json() as Promise<T>;
}

async function ensureCollection(cfg: RAGConfig): Promise<void> {
  try {
    const data = await qdrantRequest<{ collections: Array<{ name: string }> }>(
      qdrantUrl(cfg, "/collections"),
    );
    const exists = data.collections.some((c) => c.name === cfg.qdrant.collection);
    if (!exists) {
      await qdrantRequest(qdrantUrl(cfg, `/collections/${cfg.qdrant.collection}`), {
        method: "PUT",
        body: JSON.stringify({ vectors: { size: EMBEDDING_DIMS, distance: "Cosine" } }),
      });
    }
  } catch {
    // May already exist
  }
}

async function qdrantUpsert(
  cfg: RAGConfig,
  points: Array<{ id: number; vector: number[]; payload: Record<string, unknown> }>,
): Promise<void> {
  await ensureCollection(cfg);
  await qdrantRequest(qdrantUrl(cfg, `/collections/${cfg.qdrant.collection}/points`), {
    method: "PUT",
    body: JSON.stringify({ points }),
  });
}

async function qdrantSearch(cfg: RAGConfig, queryVector: number[], limit: number) {
  await ensureCollection(cfg);
  const data = await qdrantRequest<{
    result: Array<{ id: number; score: number; payload: Record<string, unknown> }>;
  }>(qdrantUrl(cfg, `/collections/${cfg.qdrant.collection}/points/query`), {
    method: "POST",
    body: JSON.stringify({ query: queryVector, limit }),
  });
  return data.result ?? [];
}

async function qdrantDelete(cfg: RAGConfig, points: number[]): Promise<void> {
  await qdrantRequest(qdrantUrl(cfg, `/collections/${cfg.qdrant.collection}/points/delete`), {
    method: "POST",
    body: JSON.stringify({ points }),
  });
}

// ── In-memory Doc Metadata Store ─────────────────────────────────────────────

const docMetadata = new Map<string, { title: string; file_type: string; chunk_count: number }>();

// ── RAG Operations ──────────────────────────────────────────────────────────

async function indexDocument(
  api: GreenchClawPluginApi,
  args: { file_path: string },
): Promise<{ success: boolean; output: string; error: string | null }> {
  const cfg = getRAGConfig(api);
  const { readFileSync } = await import("node:fs");
  const { basename, extname } = await import("node:path");
  const crypto = await import("node:crypto");

  let filePath = args.file_path;
  const fileType = extname(filePath).replace(".", "") || "txt";
  const title = basename(filePath);

  let buffer: Buffer;
  try {
    const stat = readFileSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return {
        success: false,
        output: "",
        error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      };
    }
    buffer = stat;
  } catch (err) {
    return { success: false, output: "", error: `Could not read file: ${err}` };
  }

  const text = await parseDocument(buffer, fileType);
  if (!text.trim()) {
    return { success: false, output: "", error: "Document is empty" };
  }

  const chunks = chunkText(text, cfg.chunking.chunkSize, cfg.chunking.chunkOverlap);
  if (!chunks.length) {
    return { success: false, output: "", error: "No text chunks generated" };
  }

  const docId = crypto.randomUUID();
  const vectors = await embedTexts(
    chunks.map((c) => c.text),
    cfg.ollama.baseUrl,
    cfg.ollama.embeddingModel,
  );

  const points = chunks.map((chunk, i) => ({
    id: Math.abs(
      parseInt(crypto.createHash("sha1").update(`${docId}_${i}`).digest("hex").slice(0, 16), 16),
    ),
    vector: vectors[i],
    payload: {
      doc_id: docId,
      doc_title: title,
      file_type: fileType,
      chunk_id: chunk.chunk_id,
      chunk_index: i,
      text: chunk.text,
    },
  }));

  await qdrantUpsert(cfg, points);
  docMetadata.set(docId, { title, file_type: fileType, chunk_count: chunks.length });

  return {
    success: true,
    output: `Indexed "${title}" — ${chunks.length} chunks stored in Qdrant collection "${cfg.qdrant.collection}"`,
    error: null,
  };
}

async function searchDocuments(
  api: GreenchClawPluginApi,
  args: { query: string; top_k?: number },
): Promise<{ success: boolean; output: string; error: string | null }> {
  const cfg = getRAGConfig(api);
  const topK = args.top_k ?? 5;

  const vectors = await embedTexts([args.query], cfg.ollama.baseUrl, cfg.ollama.embeddingModel);

  const results = await qdrantSearch(cfg, vectors[0], topK);
  if (!results.length) {
    return { success: true, output: "No results found.", error: null };
  }

  const lines = results.map(
    (r, i) =>
      `[${i + 1}] ${(r.payload.doc_title as string) ?? "?"} (score: ${r.score.toFixed(3)})\n${(r.payload.text as string) ?? ""}`,
  );

  return { success: true, output: lines.join("\n\n"), error: null };
}

async function listDocuments(
  _api: GreenchClawPluginApi,
  _args: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error: string | null }> {
  if (!docMetadata.size) {
    return { success: true, output: "No documents indexed yet.", error: null };
  }
  const lines = [...docMetadata.entries()].map(
    ([id, meta]) =>
      `${meta.title} (${meta.file_type}) — ${meta.chunk_count} chunks [${id.slice(0, 8)}]`,
  );
  return { success: true, output: lines.join("\n"), error: null };
}

async function deleteDocument(
  api: GreenchClawPluginApi,
  args: { doc_id: string },
): Promise<{ success: boolean; output: string; error: string | null }> {
  const cfg = getRAGConfig(api);
  const { doc_id } = args;
  const crypto = await import("node:crypto");

  const meta = docMetadata.get(doc_id);
  if (!meta) {
    return { success: false, output: "", error: `Document ID "${doc_id}" not found` };
  }

  const chunkCount = meta.chunk_count;
  const pointIds = Array.from({ length: chunkCount }, (_, i) =>
    Math.abs(
      parseInt(crypto.createHash("sha1").update(`${doc_id}_${i}`).digest("hex").slice(0, 16), 16),
    ),
  );

  await qdrantDelete(cfg, pointIds);
  docMetadata.delete(doc_id);

  return {
    success: true,
    output: `Deleted document "${meta.title}" and ${chunkCount} chunks`,
    error: null,
  };
}

// ── Plugin Entry ─────────────────────────────────────────────────────────────

export default definePluginEntry({
  id: "greench-rag",
  name: "GreenchRAG",
  description:
    "Document RAG pipeline — parse, chunk, embed, and search PDFs, DOCX, and TXT files via Qdrant + Ollama.",
  register(api: GreenchClawPluginApi) {
    api.registerTool(
      () => ({
        name: "rag_index",
        description:
          "Index a document (PDF, DOCX, or TXT) for semantic search. Parses, chunks, embeds via Ollama, and stores in Qdrant.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Absolute path to the document file" },
          },
          required: ["file_path"],
        },
        execute: async (toolCallId, toolParams) => {
          return indexDocument(api, toolParams as { file_path: string });
        },
      }),
      { names: ["rag_index"] },
    );

    api.registerTool(
      () => ({
        name: "rag_search",
        description: "Semantic search across indexed documents.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            top_k: { type: "number", description: "Max results (default 5)" },
          },
          required: ["query"],
        },
        execute: async (_toolCallId, toolParams) => {
          return searchDocuments(api, toolParams as { query: string; top_k?: number });
        },
      }),
      { names: ["rag_search"] },
    );

    api.registerTool(
      () => ({
        name: "rag_list",
        description: "List all indexed documents.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => listDocuments(api, {}),
      }),
      { names: ["rag_list"] },
    );

    api.registerTool(
      () => ({
        name: "rag_delete",
        description: "Delete an indexed document by its doc_id.",
        inputSchema: {
          type: "object",
          properties: {
            doc_id: { type: "string", description: "Document ID returned from rag_index" },
          },
          required: ["doc_id"],
        },
        execute: async (_toolCallId, toolParams) => {
          return deleteDocument(api, toolParams as { doc_id: string });
        },
      }),
      { names: ["rag_delete"] },
    );

    api.logger.info?.("greench-rag: registered");
  },
  tools: {
    rag_index: {
      description: "Index a document for semantic search.",
      inputSchema: {
        type: "object",
        properties: { file_path: { type: "string" } },
        required: ["file_path"],
      },
    },
    rag_search: {
      description: "Search indexed documents.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" }, top_k: { type: "number" } },
        required: ["query"],
      },
    },
    rag_list: {
      description: "List all indexed documents.",
      inputSchema: { type: "object", properties: {} },
    },
    rag_delete: {
      description: "Delete a document by ID.",
      inputSchema: {
        type: "object",
        properties: { doc_id: { type: "string" } },
        required: ["doc_id"],
      },
    },
  },
});
