import type { DatabaseSync } from "node:sqlite";
import { formatErrorMessage } from "./error-utils.js";

export function ensureMemoryIndexSchema(params: {
  db: DatabaseSync;
  embeddingCacheTable: string;
  cacheEnabled: boolean;
  ftsTable: string;
  ftsEnabled: boolean;
  ftsTokenizer?: "unicode61" | "trigram";
}): { ftsAvailable: boolean; ftsError?: string } {
  params.db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  params.db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'memory',
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL
    );
  `);
  params.db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      model TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  if (params.cacheEnabled) {
    params.db.exec(`
      CREATE TABLE IF NOT EXISTS ${params.embeddingCacheTable} (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        provider_key TEXT NOT NULL,
        hash TEXT NOT NULL,
        embedding TEXT NOT NULL,
        dims INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (provider, model, provider_key, hash)
      );
    `);
    params.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_embedding_cache_updated_at ON ${params.embeddingCacheTable}(updated_at);`,
    );
  }

  let ftsAvailable = false;
  let ftsError: string | undefined;
  if (params.ftsEnabled) {
    try {
      const tokenizer = params.ftsTokenizer ?? "unicode61";
      const tokenizeClause = tokenizer === "trigram" ? `, tokenize='trigram case_sensitive 0'` : "";
      params.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS ${params.ftsTable} USING fts5(\n` +
          `  text,\n` +
          `  id UNINDEXED,\n` +
          `  path UNINDEXED,\n` +
          `  source UNINDEXED,\n` +
          `  model UNINDEXED,\n` +
          `  start_line UNINDEXED,\n` +
          `  end_line UNINDEXED\n` +
          `${tokenizeClause});`,
      );
      ftsAvailable = true;
    } catch (err) {
      const message = formatErrorMessage(err);
      ftsAvailable = false;
      ftsError = message;
    }
  }

  ensureColumn(params.db, "files", "source", "TEXT NOT NULL DEFAULT 'memory'");
  ensureColumn(params.db, "chunks", "source", "TEXT NOT NULL DEFAULT 'memory'");
  params.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);`);
  params.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);`);

  // ── Agent Facts table (Memory System v2) ─────────────────────────────────
  // Stores structured facts extracted from conversation turns
  params.db.exec(`
    CREATE TABLE IF NOT EXISTS agent_facts (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      embedding TEXT,
      attributed_to TEXT NOT NULL DEFAULT 'user',
      agent_id TEXT NOT NULL,
      session_id TEXT,
      user_id TEXT,
      created_at INTEGER NOT NULL,
      importance REAL NOT NULL DEFAULT 0.5,
      metadata TEXT
    );
  `);
  params.db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_agent_id ON agent_facts(agent_id);`);
  params.db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_session_id ON agent_facts(session_id);`);
  params.db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_user_id ON agent_facts(user_id);`);
  params.db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_created_at ON agent_facts(created_at);`);

  // FTS5 for agent_facts text search
  if (params.ftsEnabled) {
    const tokenizer = params.ftsTokenizer ?? "unicode61";
    const tokenizeClause = tokenizer === "trigram" ? `, tokenize='trigram case_sensitive 0'` : "";
    try {
      params.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS agent_facts_fts USING fts5(
          text,
          id UNINDEXED,
          agent_id UNINDEXED,
          attributed_to UNINDEXED
          ${tokenizeClause});`,
      );
    } catch {
      // FTS creation error — non-fatal
    }
  }

  return { ftsAvailable, ...(ftsError ? { ftsError } : {}) };
}

function ensureColumn(
  db: DatabaseSync,
  table: "files" | "chunks",
  column: string,
  definition: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
