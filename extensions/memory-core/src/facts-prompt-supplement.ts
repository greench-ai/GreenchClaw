/**
 * facts-prompt-supplement.ts
 *
 * Registers a "zz-facts" memory prompt supplement that injects extracted
 * agent facts (from Memory System v2) into the system prompt section.
 * Runs after all other memory sections (zz- sort key).
 *
 * Config: agents.defaults.memorySearch.factsEnabled (default: true)
 * DB:     Same SQLite store as the memory index (~/.GreenchClaw/memory/{agentId}.sqlite)
 */

import { resolveUserPath } from "GreenchClaw/plugin-sdk/memory-core-host-engine-foundation";
import {
  searchFacts,
  type FactSearchResult,
} from "GreenchClaw/plugin-sdk/memory-core-host-engine-storage";
import type { MemoryPromptSectionBuilder } from "GreenchClaw/plugin-sdk/memory-core-host-runtime-core";
import {
  getRuntimeConfig,
  resolveMemorySearchConfig,
} from "GreenchClaw/plugin-sdk/memory-core-host-runtime-core";
import { openMemoryDatabaseAtPath } from "./memory/manager-db.js";

const FACTS_QUERY = "user preferences plans identity biography";
const FACTS_LIMIT = 10;

function formatFactsSection(results: FactSearchResult[]): string[] {
  if (results.length === 0) {
    return [];
  }
  const lines: string[] = ["## Facts", ""];
  for (const fact of results) {
    const attr = fact.attributed_to === "assistant" ? "(from assistant)" : "(from user)";
    lines.push(`- ${fact.text} ${attr}`);
  }
  lines.push("");
  return lines;
}

export const buildFactsPromptSupplement: MemoryPromptSectionBuilder = ({
  agentId,
}: {
  agentId?: string;
}) => {
  if (!agentId) {
    return [];
  }

  const cfg = getRuntimeConfig();
  if (!cfg) {
    return [];
  }

  // Respect the factsEnabled flag (defaults to true when not set)
  const memoryCfg = cfg.memory;
  if (memoryCfg?.factsEnabled === false) {
    return [];
  }

  const settings = resolveMemorySearchConfig(cfg, agentId);
  if (!settings) {
    return [];
  }

  let dbPath: string;
  try {
    dbPath = resolveUserPath(settings.store.path);
  } catch {
    return [];
  }

  let db: ReturnType<typeof openMemoryDatabaseAtPath>;
  try {
    db = openMemoryDatabaseAtPath(dbPath, /* allowExtension */ false);
  } catch {
    return [];
  }

  try {
    const results = searchFacts({
      db,
      query: FACTS_QUERY,
      agent_id: agentId,
      limit: FACTS_LIMIT,
    });
    return formatFactsSection(results);
  } catch {
    return [];
  } finally {
    db.close();
  }
};
