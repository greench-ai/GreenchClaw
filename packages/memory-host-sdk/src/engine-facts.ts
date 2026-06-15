// Agent Facts — Structured fact extraction and long-term memory
// Part of Memory System v2

import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type AgentFact = {
  id: string;
  text: string;
  embedding: number[] | null;
  attributed_to: "user" | "assistant";
  agent_id: string;
  session_id: string | null;
  user_id: string | null;
  created_at: number;
  importance: number;
  metadata: Record<string, unknown> | null;
};

export type StoredFact = {
  id: string;
  text: string;
  attributed_to: string;
  agent_id: string;
  session_id: string | null;
  user_id: string | null;
  created_at: number;
  importance: number;
  metadata: string | null;
};

export type FactSearchResult = {
  id: string;
  text: string;
  attributed_to: string;
  agent_id: string;
  session_id: string | null;
  user_id: string | null;
  created_at: number;
  importance: number;
  score: number;
  vectorScore?: number;
  textScore?: number;
};

// ── Storage ─────────────────────────────────────────────────────────────────

export function upsertFact(params: { db: DatabaseSync; fact: AgentFact }): void {
  const { db, fact } = params;
  const embeddingJson = fact.embedding ? JSON.stringify(fact.embedding) : null;
  const metadataJson = fact.metadata ? JSON.stringify(fact.metadata) : null;

  db.prepare(`
    INSERT INTO agent_facts (id, text, embedding, attributed_to, agent_id, session_id, user_id, created_at, importance, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      text = excluded.text,
      embedding = excluded.embedding,
      importance = excluded.importance
  `).run(
    fact.id,
    fact.text,
    embeddingJson,
    fact.attributed_to,
    fact.agent_id,
    fact.session_id,
    fact.user_id,
    fact.created_at,
    fact.importance,
    metadataJson,
  );

  // Also update FTS index
  if (embeddingJson) {
    try {
      db.prepare(`
        INSERT INTO agent_facts_fts (rowid, text, id, agent_id, attributed_to)
        SELECT rowid, text, id, agent_id, attributed_to FROM agent_facts WHERE id = ?
        ON CONFLICT(rowid) DO UPDATE SET text = excluded.text
      `).run(fact.id);
    } catch {
      // FTS update failed — non-fatal
    }
  }
}

export function searchFacts(params: {
  db: DatabaseSync;
  query: string;
  agent_id?: string;
  session_id?: string;
  user_id?: string;
  limit?: number;
  minScore?: number;
  embeddingCache?: Map<string, number[]>;
  getEmbedding?: (text: string) => number[] | null;
}): FactSearchResult[] {
  const { db, query, agent_id, session_id, user_id, limit = 20, minScore = 0.0 } = params;
  const results: FactSearchResult[] = [];

  // Build WHERE clause
  const conditions: string[] = [];
  const args: (string | number)[] = [];
  if (agent_id) {
    conditions.push("agent_id = ?");
    args.push(agent_id);
  }
  if (session_id) {
    conditions.push("session_id = ?");
    args.push(session_id);
  }
  if (user_id) {
    conditions.push("user_id = ?");
    args.push(user_id);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // FTS5 keyword search
  let ftsScore = 0;
  let ftsQuery = query;
  try {
    // Sanitize for FTS5 — escape special chars
    ftsQuery = query.replace(/['\"*]/g, " ");
    const ftsSql = `
      SELECT f.id, f.text, f.attributed_to, f.agent_id, f.session_id, f.user_id, f.created_at, f.importance,
             bm25(agent_facts_fts) AS text_score,
             ROW_NUMBER() OVER (ORDER BY bm25(agent_facts_fts)) AS rank
      FROM agent_facts_fts
      JOIN agent_facts f ON agent_facts_fts.id = f.id
      WHERE agent_facts_fts MATCH ?
      ${agent_id ? "AND f.agent_id = ?" : ""}
      ${session_id ? "AND f.session_id = ?" : ""}
      ${user_id ? "AND f.user_id = ?" : ""}
      ORDER BY rank
      LIMIT ?
    `;
    const ftsArgs = [
      ftsQuery,
      ...(agent_id ? [agent_id] : []),
      ...(session_id ? [session_id] : []),
      ...(user_id ? [user_id] : []),
      limit,
    ];
    const ftsRows = db.prepare(ftsSql).all(...ftsArgs) as Array<{
      id: string;
      text: string;
      attributed_to: string;
      agent_id: string;
      session_id: string | null;
      user_id: string | null;
      created_at: number;
      importance: number;
      text_score: number;
      rank: number;
    }>;
    for (const row of ftsRows) {
      const textScore = Math.max(0, -row.text_score / 10);
      if (textScore < minScore) continue;
      results.push({
        id: row.id,
        text: row.text,
        attributed_to: row.attributed_to,
        agent_id: row.agent_id,
        session_id: row.session_id,
        user_id: row.user_id,
        created_at: row.created_at,
        importance: row.importance,
        score: textScore,
        textScore,
        vectorScore: undefined,
      });
    }
  } catch {
    // FTS failed — fall through to raw SQL
  }

  // Vector similarity search (if embeddings available and query not already covered)
  if (params.getEmbedding) {
    const queryEmbedding = params.getEmbedding(query);
    if (queryEmbedding && results.length < limit) {
      const vectorRows = db
        .prepare(`
        SELECT id, text, attributed_to, agent_id, session_id, user_id, created_at, importance, embedding
        FROM agent_facts
        ${whereClause}
        AND embedding IS NOT NULL
        LIMIT 100
      `)
        .all(...args) as Array<{
        id: string;
        text: string;
        attributed_to: string;
        agent_id: string;
        session_id: string | null;
        user_id: string | null;
        created_at: number;
        importance: number;
        embedding: string;
      }>;

      const scored = vectorRows
        .map((row) => {
          try {
            const emb = JSON.parse(row.embedding) as number[];
            const sim = cosineSimilarity(queryEmbedding, emb);
            return { row, sim };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as { row: (typeof vectorRows)[0]; sim: number }[];

      scored.sort((a, b) => b.sim - a.sim);
      for (const item of scored.slice(0, limit)) {
        const existingIds = new Set(results.map((r) => r.id));
        if (!existingIds.has(item.row.id)) {
          results.push({
            id: item.row.id,
            text: item.row.text,
            attributed_to: item.row.attributed_to,
            agent_id: item.row.agent_id,
            session_id: item.row.session_id,
            user_id: item.row.user_id,
            created_at: item.row.created_at,
            importance: item.row.importance,
            score: item.sim,
            vectorScore: item.sim,
            textScore: undefined,
          });
        }
      }
    }
  }

  // Sort by combined score
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function listFacts(params: {
  db: DatabaseSync;
  agent_id?: string;
  session_id?: string;
  user_id?: string;
  limit?: number;
}): StoredFact[] {
  const { db, agent_id, session_id, user_id, limit = 50 } = params;
  const conditions: string[] = [];
  const args: (string | number)[] = [];
  if (agent_id) {
    conditions.push("agent_id = ?");
    args.push(agent_id);
  }
  if (session_id) {
    conditions.push("session_id = ?");
    args.push(session_id);
  }
  if (user_id) {
    conditions.push("user_id = ?");
    args.push(user_id);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(`
    SELECT id, text, attributed_to, agent_id, session_id, user_id, created_at, importance, metadata
    FROM agent_facts
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ?
  `)
    .all(...args, limit) as StoredFact[];
}

export function deleteFact(params: { db: DatabaseSync; id: string }): void {
  const { db, id } = params;
  db.prepare("DELETE FROM agent_facts WHERE id = ?").run(id);
  try {
    db.prepare("DELETE FROM agent_facts_fts WHERE id = ?").run(id);
  } catch {
    // FTS delete failed — non-fatal
  }
}

export function countFacts(params: { db: DatabaseSync; agent_id?: string }): number {
  const { db, agent_id } = params;
  if (agent_id) {
    const row = db
      .prepare("SELECT COUNT(*) as n FROM agent_facts WHERE agent_id = ?")
      .get(agent_id) as { n: number };
    return row.n;
  }
  const row = db.prepare("SELECT COUNT(*) as n FROM agent_facts").get() as { n: number };
  return row.n;
}

// ── Cosine Similarity ───────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── ID Generation ────────────────────────────────────────────────────────────

export function generateFactId(): string {
  return `fact-${crypto.randomUUID()}`;
}
