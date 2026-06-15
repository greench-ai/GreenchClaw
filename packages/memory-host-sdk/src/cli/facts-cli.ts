#!/usr/bin/env node
// facts-cli.ts — CLI for agent fact extraction and recall
// Part of Memory System v2

import fs from "node:fs";
import path from "node:path";
import { extractFactsFromTurn, type ExtractionMessage } from "../engine-extract.js";
import {
  upsertFact,
  searchFacts,
  listFacts,
  countFacts,
  generateFactId,
} from "../engine-storage.js";
import { ensureMemoryIndexSchema } from "../host/memory-schema.js";
import { requireNodeSqlite } from "../host/sqlite.js";

// ── Config ─────────────────────────────────────────────────────────────────

const DB_PATH =
  process.env.GREENCHCLAW_MEMORY_DB ||
  path.join(process.env.HOME || ".", ".GreenchClaw", "memory", "main.sqlite");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const EXTRACTION_MODEL = process.env.FACTS_EXTRACTION_MODEL || "anthropic/claude-3-haiku";

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdExtract(
  messages: ExtractionMessage[],
  opts: { agent_id: string; session_id?: string; user_id?: string },
) {
  console.error(`[facts] Extracting facts from ${messages.length} messages...`);
  const result = await extractFactsFromTurn({
    messages,
    model: EXTRACTION_MODEL,
    apiKey: OPENROUTER_API_KEY,
  });

  if (result.error) {
    console.error(`[facts] Extraction error: ${result.error}`);
    process.exit(1);
  }

  if (result.memory.length === 0) {
    console.log("[]");
    return;
  }

  // Store facts in DB
  const sqlite = requireNodeSqlite();
  const db = sqlite.open(DB_PATH);
  ensureMemoryIndexSchema({
    db,
    embeddingCacheTable: "embedding_cache",
    cacheEnabled: true,
    ftsTable: "chunks_fts",
    ftsEnabled: true,
  });

  for (const fact of result.memory) {
    upsertFact({
      db,
      fact: {
        id: generateFactId(),
        text: fact.text,
        embedding: null, // embeddings added on-demand during search
        attributed_to: fact.attributed_to,
        agent_id: opts.agent_id,
        session_id: opts.session_id || null,
        user_id: opts.user_id || null,
        created_at: fact.created_at,
        importance: fact.importance,
        metadata: fact.metadata,
      },
    });
  }

  db.close();
  console.log(JSON.stringify(result.memory, null, 2));
}

async function cmdSearch(
  query: string,
  opts: { agent_id?: string; session_id?: string; user_id?: string; limit?: number },
) {
  const sqlite = requireNodeSqlite();
  const db = sqlite.open(DB_PATH);

  const results = searchFacts({
    db,
    query,
    agent_id: opts.agent_id,
    session_id: opts.session_id,
    user_id: opts.user_id,
    limit: opts.limit || 10,
  });

  db.close();
  console.log(JSON.stringify(results, null, 2));
}

async function cmdList(opts: {
  agent_id?: string;
  session_id?: string;
  user_id?: string;
  limit?: number;
}) {
  const sqlite = requireNodeSqlite();
  const db = sqlite.open(DB_PATH);

  const facts = listFacts({
    db,
    agent_id: opts.agent_id,
    session_id: opts.session_id,
    user_id: opts.user_id,
    limit: opts.limit || 50,
  });

  db.close();
  console.log(JSON.stringify(facts, null, 2));
}

async function cmdCount(opts: { agent_id?: string }) {
  const sqlite = requireNodeSqlite();
  const db = sqlite.open(DB_PATH);

  const count = countFacts({ db, agent_id: opts.agent_id });
  db.close();
  console.log(JSON.stringify({ count }));
}

// ── CLI Router ─────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === "extract") {
  // extract expects JSON array of messages from stdin or arg
  let messages: ExtractionMessage[] = [];
  if (args[0] === "--json") {
    const input = args.slice(1).join(" ") || fs.readFileSync("/dev/stdin", "utf-8");
    messages = JSON.parse(input);
  } else if (args[0] === "--file") {
    const fileContent = fs.readFileSync(args[1], "utf-8");
    messages = JSON.parse(fileContent);
  } else {
    console.error('Usage: facts-cli extract --json \'[{"role":"user","content":"..."}]\'');
    process.exit(1);
  }
  const agent_id = process.env.FACTS_AGENT_ID || "gohan";
  const session_id = process.env.FACTS_SESSION_ID;
  const user_id = process.env.FACTS_USER_ID;
  await cmdExtract(messages, { agent_id, session_id, user_id });
} else if (cmd === "search") {
  const query = args[0] || "";
  const agent_id = process.env.FACTS_AGENT_ID;
  const session_id = process.env.FACTS_SESSION_ID;
  const user_id = process.env.FACTS_USER_ID;
  const limit = parseInt(process.env.FACTS_LIMIT || "10", 10);
  await cmdSearch(query, { agent_id, session_id, user_id, limit });
} else if (cmd === "list") {
  const agent_id = process.env.FACTS_AGENT_ID;
  const session_id = process.env.FACTS_SESSION_ID;
  const user_id = process.env.FACTS_USER_ID;
  const limit = parseInt(process.env.FACTS_LIMIT || "50", 10);
  await cmdList({ agent_id, session_id, user_id, limit });
} else if (cmd === "count") {
  const agent_id = process.env.FACTS_AGENT_ID;
  await cmdCount({ agent_id });
} else {
  console.log(`Usage:
  facts-cli extract --json '[{"role":"user","content":"..."}]'
  facts-cli search "query text"
  facts-cli list
  facts-cli count
Environment:
  GREENCHCLAW_MEMORY_DB   Path to memory SQLite (default: ~/.GreenchClaw/memory/main.sqlite)
  OPENROUTER_API_KEY     API key for extraction model
  FACTS_AGENT_ID         Agent ID for scoped storage
  FACTS_SESSION_ID       Session ID for scoped storage
  FACTS_USER_ID          User ID for scoped storage
  FACTS_LIMIT            Limit for search/list (default: 10)
  FACTS_EXTRACTION_MODEL Model for extraction (default: anthropic/claude-3-haiku)
`);
  process.exit(cmd ? 1 : 0);
}
