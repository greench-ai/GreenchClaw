/**
 * facts-extraction.ts
 *
 * Background task that scans session transcripts, extracts structured facts
 * using an LLM, and stores them in the agent_facts table.
 *
 * Runs on a cron schedule (default: every 30 minutes) as a setInterval
 * inside the gateway process. Each run:
 *   1. Finds recent session files (last 24h) for each facts-enabled agent
 *   2. Skips sessions already known to have facts stored
 *   3. For each session: parses user/assistant messages → extracts facts via Haiku
 *   4. Upserts facts into the agent's SQLite memory store
 *
 * Dedup: sessions with ANY existing fact in agent_facts are skipped entirely.
 * This means re-runs won't regenerate facts for old sessions — acceptable tradeoff
 * given that extraction is expensive. Fresh sessions are picked up on the next run.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import { resolveUserPath } from "GreenchClaw/plugin-sdk/memory-core-host-engine-foundation";
import { resolveMemorySearchConfig } from "GreenchClaw/plugin-sdk/memory-core-host-runtime-core";
import { resolveSessionTranscriptsDirForAgent } from "GreenchClaw/plugin-sdk/memory-core-host-runtime-core";
// Import directly from memory-host-sdk package (uses exports map + TypeScript paths)
import { extractFactsFromTurn, type ExtractionMessage } from "memory-host-sdk/engine-extract";
import { generateFactId, upsertFact } from "memory-host-sdk/engine-facts";
import { openMemoryDatabaseAtPath } from "./memory/manager-db.js";

// ── Config defaults ──────────────────────────────────────────────────────────

const DEFAULT_FACTS_EXTRACTION_LIMIT = 10; // max sessions per agent per run
const DEFAULT_FACTS_LOOKBACK_HOURS = 24; // only process sessions from last 24h
const DEFAULT_EXTRACTION_MODEL = "anthropic/claude-3-haiku";
const DEFAULT_EXTRACTION_TIMEOUT_MS = 12_000;
const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";

// ── Types ────────────────────────────────────────────────────────────────────

export type FactsExtractionConfig = {
  enabled: boolean;
  cron: string;
  timezone?: string;
  limit: number; // max sessions per agent per run
  lookbackHours: number; // only process sessions newer than this
  extractionModel: string;
  extractionTimeoutMs: number;
};

export type FactsExtractionResult = {
  sessionsScanned: number;
  sessionsProcessed: number;
  factsExtracted: number;
  errors: number;
};

export type FactsExtractionLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

// ── Transcript parsing ───────────────────────────────────────────────────────

interface TranscriptEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  content?: string;
  role?: string;
  text?: string;
  message?: { role?: string; content?: string };
}

function readTranscriptMessages(sessionPath: string): ExtractionMessage[] {
  const messages: ExtractionMessage[] = [];
  let raw: string;
  try {
    raw = readFileSync(sessionPath, "utf-8");
  } catch {
    return [];
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(trimmed) as TranscriptEntry;
    } catch {
      continue;
    }
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    const content = entry.content ?? entry.text ?? entry.message?.content ?? "";
    if (!content || typeof content !== "string" || !content.trim()) continue;
    const role = entry.role ?? entry.message?.role ?? entry.type;
    messages.push({ role: role as "user" | "assistant", content: content.trim() });
  }
  return messages;
}

// ── Session discovery ─────────────────────────────────────────────────────────

function getRecentSessionFiles(sessionsDir: string, lookbackMs: number): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const cutoff = Date.now() - lookbackMs;
  const files: string[] = [];
  try {
    for (const entry of readdirSync(sessionsDir)) {
      // Skip trajectory files and topic files
      if (entry.endsWith(".trajectory.jsonl") || entry.includes("-topic-")) continue;
      if (!entry.endsWith(".jsonl")) continue;
      const fullPath = path.join(sessionsDir, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.mtimeMs >= cutoff) {
        files.push(fullPath);
      }
    }
  } catch {
    // sessionsDir may not exist
  }
  return files;
}

function sessionIdFromPath(filePath: string): string {
  return path.basename(filePath, ".jsonl");
}

// ── Facts extraction ─────────────────────────────────────────────────────────

async function extractFactsForSession(params: {
  sessionPath: string;
  sessionId: string;
  agentId: string;
  db: ReturnType<typeof openMemoryDatabaseAtPath>;
  config: FactsExtractionConfig;
  logger: FactsExtractionLogger;
}): Promise<number> {
  const { sessionPath, sessionId, agentId, db, config, logger } = params;

  const messages = readTranscriptMessages(sessionPath);
  if (messages.length === 0) {
    return 0;
  }

  // Group consecutive messages into turns (user → assistant = one turn)
  // Extract facts for each user→assistant exchange
  let factsStored = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    // Pair with next assistant message if present
    const turnMessages: ExtractionMessage[] = [msg];
    if (i + 1 < messages.length && messages[i + 1].role === "assistant") {
      turnMessages.push(messages[i + 1]);
    }

    const apiKey = process.env[OPENROUTER_API_KEY_ENV] ?? "";
    const result = await extractFactsFromTurn({
      messages: turnMessages,
      model: config.extractionModel,
      apiKey,
      timeoutMs: config.extractionTimeoutMs,
    });

    if (result.error && result.error !== "timeout") {
      logger.warn(`[facts-extract] session=${sessionId} turn=${i} error=${result.error}`);
    }

    for (const fact of result.memory) {
      upsertFact({
        db,
        fact: {
          id: generateFactId(),
          text: fact.text,
          embedding: null,
          attributed_to: fact.attributed_to,
          agent_id: agentId,
          session_id: sessionId,
          user_id: null,
          created_at: fact.created_at,
          importance: fact.importance,
          metadata: { turn_index: i, extracted_from: "facts-extraction" },
        },
      });
      factsStored++;
    }
  }

  return factsStored;
}

// ── Main exported function ───────────────────────────────────────────────────

export async function runFactsExtraction(params: {
  cfg: GreenchClawConfig;
  agentId: string;
  config: FactsExtractionConfig;
  logger: FactsExtractionLogger;
}): Promise<FactsExtractionResult> {
  const { cfg, agentId, config, logger } = params;

  const result: FactsExtractionResult = {
    sessionsScanned: 0,
    sessionsProcessed: 0,
    factsExtracted: 0,
    errors: 0,
  };

  if (!config.enabled) {
    return result;
  }

  // Resolve memory store
  const settings = resolveMemorySearchConfig(cfg, agentId);
  if (!settings) {
    logger.info("[facts-extract] memory search not configured, skipping");
    return result;
  }

  let dbPath: string;
  try {
    dbPath = resolveUserPath(settings.store.path);
  } catch {
    logger.warn("[facts-extract] could not resolve memory store path, skipping");
    return result;
  }

  let db: ReturnType<typeof openMemoryDatabaseAtPath>;
  try {
    db = openMemoryDatabaseAtPath(dbPath, /* allowExtension */ false);
  } catch (err) {
    logger.warn(`[facts-extract] could not open memory DB: ${err}, skipping`);
    return result;
  }

  // Find sessions already processed (have any fact with this session_id)
  const processedSessions = new Set<string>();
  try {
    const rows = db
      .prepare("SELECT DISTINCT session_id FROM agent_facts WHERE session_id IS NOT NULL")
      .all() as Array<{ session_id: string }>;
    for (const row of rows) {
      if (row.session_id) processedSessions.add(row.session_id);
    }
  } catch {
    // table may not exist yet — skip
  }

  // Get session files
  const sessionsDir = resolveSessionTranscriptsDirForAgent(agentId);
  const lookbackMs = config.lookbackHours * 60 * 60 * 1000;
  const recentFiles = getRecentSessionFiles(sessionsDir, lookbackMs);
  result.sessionsScanned = recentFiles.length;

  // Filter out already-processed sessions
  const toProcess = recentFiles
    .map((p) => ({ path: p, id: sessionIdFromPath(p) }))
    .filter((s) => !processedSessions.has(s.id))
    .slice(0, config.limit);

  logger.info(
    `[facts-extract] agent=${agentId} sessions_dir=${sessionsDir} ` +
      `recent=${recentFiles.length} already_processed=${processedSessions.size} ` +
      `queued=${toProcess.length}`,
  );

  for (const session of toProcess) {
    try {
      const count = await extractFactsForSession({
        sessionPath: session.path,
        sessionId: session.id,
        agentId,
        db,
        config,
        logger,
      });
      result.sessionsProcessed++;
      result.factsExtracted += count;
      logger.info(`[facts-extract] session=${session.id} facts_stored=${count}`);
    } catch (err) {
      result.errors++;
      logger.warn(`[facts-extract] session=${session.id} error=${err}`);
    }
  }

  db.close();
  return result;
}

// ── Interval runner ──────────────────────────────────────────────────────────

let extractionInterval: ReturnType<typeof setInterval> | null = null;
let lastExtractionAtMs = 0;

function getConfiguredAgentIds(cfg: GreenchClawConfig): string[] {
  const ids = new Set<string>(["main"]);
  const agentList = (cfg.agents as { list?: Array<{ id?: string }> } | undefined)?.list;
  if (agentList) {
    for (const agent of agentList) {
      if (agent.id) ids.add(agent.id);
    }
  }
  return Array.from(ids);
}

function parseCronToIntervalMs(cronExpr: string): number | null {
  // "0 */30 * * * *" → every 30 minutes (6-field cron with seconds)
  const match6 = cronExpr.match(/^\s*(\d+)\s+\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (match6) {
    return parseInt(match6[2], 10) * 60 * 1000;
  }
  // "*/30 * * * *" → every 30 minutes (5-field cron, no seconds)
  const match5 = cronExpr.match(/^\s*\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (match5) {
    return parseInt(match5[1], 10) * 60 * 1000;
  }
  return null; // unparseable → use default
}

/**
 * Run extraction for all agents that have factsEnabled: true.
 */
export async function runFactsExtractionForAllAgents(params: {
  cfg: GreenchClawConfig;
  logger: FactsExtractionLogger;
}): Promise<void> {
  const { cfg, logger } = params;

  const globalEnabled = (cfg.memory as { factsEnabled?: boolean } | undefined)?.factsEnabled;
  if (globalEnabled === false) {
    return; // globally disabled
  }

  const agentIds = getConfiguredAgentIds(cfg);
  let totalFacts = 0;
  let totalSessions = 0;
  let totalErrors = 0;

  for (const agentId of agentIds) {
    // Per-agent override falls back to global setting
    const agentEntry = (
      cfg.agents as
        | {
            list?: Array<{
              id?: string;
              memory?: { factsEnabled?: boolean };
            }>;
          }
        | undefined
    )?.list?.find((a) => a.id === agentId);
    const agentEnabled = agentEntry?.memory?.factsEnabled ?? globalEnabled ?? true;
    if (!agentEnabled) continue;

    const config = resolveFactsExtractionConfig(cfg);
    const result = await runFactsExtraction({ cfg, agentId, config, logger });
    totalFacts += result.factsExtracted;
    totalSessions += result.sessionsProcessed;
    totalErrors += result.errors;
  }

  lastExtractionAtMs = Date.now();
  if (totalFacts > 0 || totalSessions > 0) {
    logger.info(
      `[facts-extract] run complete agents=${agentIds.length} ` +
        `sessions=${totalSessions} facts=${totalFacts} errors=${totalErrors}`,
    );
  }
}

/**
 * Start the periodic facts extraction runner.
 * Safe to call multiple times — only one interval is created.
 */
export function startFactsExtractionRunner(params: {
  cfg: GreenchClawConfig;
  logger: FactsExtractionLogger;
  getConfig: () => GreenchClawConfig;
}): void {
  const { logger, getConfig } = params;

  if (extractionInterval !== null) return; // already running

  const mc = getConfig().memory as Record<string, unknown> | undefined;
  const cronExpr = (mc?.factsExtractionCron as string | undefined) ?? "0 */30 * * * *";
  const intervalMs = parseCronToIntervalMs(cronExpr) ?? 30 * 60 * 1000;

  logger.info(`[facts-extract] starting extraction runner (interval=${intervalMs}ms)`);

  extractionInterval = setInterval(async () => {
    try {
      await runFactsExtractionForAllAgents({ cfg: getConfig(), logger });
    } catch (err) {
      logger.error(`[facts-extract] run failed: ${err}`);
    }
  }, intervalMs);
}

/** Stop the extraction runner (e.g. on plugin unload). */
export function stopFactsExtractionRunner(): void {
  if (extractionInterval !== null) {
    clearInterval(extractionInterval);
    extractionInterval = null;
    lastExtractionAtMs = 0;
  }
}

/** Returns Unix-ms of when the last extraction run finished, or 0 if never. */
export function getLastExtractionAtMs(): number {
  return lastExtractionAtMs;
}

// ── Config resolution ─────────────────────────────────────────────────────────

export function resolveFactsExtractionConfig(cfg: GreenchClawConfig): FactsExtractionConfig {
  const mc = cfg.memory as Record<string, unknown> | undefined;
  return {
    enabled: mc?.factsEnabled !== false, // default true
    cron: (mc?.factsExtractionCron as string | undefined) ?? "0 */30 * * * *",
    timezone: undefined,
    limit: (mc?.factsExtractionLimit as number | undefined) ?? DEFAULT_FACTS_EXTRACTION_LIMIT,
    lookbackHours:
      (mc?.factsExtractionLookbackHours as number | undefined) ?? DEFAULT_FACTS_LOOKBACK_HOURS,
    extractionModel: DEFAULT_EXTRACTION_MODEL,
    extractionTimeoutMs: DEFAULT_EXTRACTION_TIMEOUT_MS,
  };
}
