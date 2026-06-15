/**
 * Session Search — FTS5 full-text search over GreenchClaw session history.
 *
 * Tools: session_search | session_index | session_preview | session_stats
 */

import { spawn } from "node:child_process";
import { resolve as pathResolve } from "node:path";
import { homedir } from "node:os";
import { definePluginEntry, makeTool, type GreenchClawPluginApi } from "GreenchClaw/plugin-sdk/plugin-entry";

// ── Python runner (synchronous) ─────────────────────────────────────────────

// Python script installed to ~/.GreenchClaw/agents/session-search/
const SESSION_SEARCH_SCRIPT = pathResolve(
  homedir(),
  ".GreenchClaw",
  "agents",
  "session-search",
  "session_search.py"
);

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SESSION_SEARCH_SCRIPT, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `Python exited ${code}`));
    });
    proc.on("error", reject);
  });
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default definePluginEntry({
  id: "session-search",
  name: "Session Search",
  description: "FTS5 full-text search over GreenchClaw session history.",
  register(api: GreenchClawPluginApi) {
    // Index all sessions
    api.registerTool(
      () =>
        makeTool(
          "session_index",
          `Index all GreenchClaw sessions into FTS5. Run this:
- After session_search returns stale/no results (index may be outdated)
- After installing this plugin for the first time
- After encountering odd results (re-index to be sure)

Returns the number of records indexed and any errors encountered.`,
          {
            type: "object",
            properties: {
              force: {
                type: "boolean",
                description:
                  "Force re-index all sessions even if unchanged (default: false)",
              },
            },
          },
          async (_id, params) => {
            try {
              const args = ["index"];
              if (params.force) args.push("--force");
              const result = await runPython(args);
              const stats = JSON.parse(result);
              return {
                content: [
                  {
                    type: "text",
                    text: `Indexed ${stats.indexed_records} message records from ${stats.session_files_scanned} session files.${
                      stats.errors ? ` (${stats.errors} errors — see stderr)` : ""
                    }\nRun session_search to query.`,
                  },
                ],
              };
            } catch (e) {
              return {
                content: [{ type: "text", text: `Index failed: ${e}` }],
                isError: true,
              };
            }
          }
        )
    );

    // Search sessions
    api.registerTool(
      () =>
        makeTool(
          "session_search",
          `Search GreenchClaw session history using full-text search.
Returns matching messages with session labels, roles, snippets, and timestamps.

Use natural language or keywords. Works best with specific terms:
- "NexusOG rebrand" — finds the NexusOG rebrand work
- "CVE vulnerability" — finds security discussions
- "FTS5 session search" — finds this feature discussion
- "kernel patch" — finds kernel CVE discussions

The index must be built before first search. If results are empty or seem stale, run session_index first.`,
          {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Search query — keywords, phrases, or natural language. Be specific for best results.",
              },
              limit: {
                type: "number",
                description: "Maximum results to return (default: 10, max: 50)",
                default: 10,
              },
            },
            required: ["query"],
          },
          async (_id, params) => {
            try {
              const query = String(params.query ?? "");
              const limit = Math.min(Number(params.limit ?? 10), 50);
              const result = await runPython(["search", query, String(limit)]);
              const hits = JSON.parse(result);

              if (!hits.length) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `No results for "${query}". Try:\n- Different keywords\n- Run session_index if the index may be stale\n- Check spelling`,
                    },
                  ],
                };
              }

              const lines = hits.map(
                (h: {
                  session_id: string;
                  session_label: string;
                  role: string;
                  snippet: string;
                  timestamp: string;
                }) => {
                  const ts = h.timestamp ? h.timestamp.slice(0, 16) : "?";
                  const label = h.session_label || h.session_id.slice(0, 8);
                  return `[${ts}] ${h.role} in ${label}: ${h.snippet}`;
                }
              );

              return {
                content: [
                  {
                    type: "text",
                    text: `## ${hits.length} result${hits.length !== 1 ? "s" : ""} for "${query}"\n\n${lines.join("\n\n")}`,
                  },
                ],
              };
            } catch (e) {
              const msg = String(e);
              if (msg.includes("no such table") || msg.includes("database is locked")) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `Search unavailable: index may need building. Run session_index first. Error: ${msg.slice(0, 200)}`,
                    },
                  ],
                  isError: false,
                };
              }
              return {
                content: [{ type: "text", text: `Search failed: ${e}` }],
                isError: true,
              };
            }
          }
        )
    );

    // Preview a specific session
    api.registerTool(
      () =>
        makeTool(
          "session_preview",
          `Get recent messages from a specific session (by session_id returned from session_search). Useful for diving deeper into a match.`,
          {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "Session ID (from session_search results)",
              },
              limit: {
                type: "number",
                description: "Number of recent messages to show (default: 5)",
                default: 5,
              },
            },
            required: ["session_id"],
          },
          async (_id, params) => {
            try {
              const limit = Math.min(Number(params.limit ?? 5), 20);
              const result = await runPython([
                "preview",
                String(params.session_id),
                String(limit),
              ]);
              const msgs = JSON.parse(result);
              if (!msgs.length) {
                return {
                  content: [
                    { type: "text", text: "No messages found for that session." },
                  ],
                };
              }
              const lines = msgs.map(
                (m: { role: string; content: string; timestamp: string }) => {
                  const ts = m.timestamp ? m.timestamp.slice(0, 16) : "";
                  return `[${ts}] ${m.role}: ${m.content}`;
                }
              );
              return { content: [{ type: "text", text: lines.join("\n") }] };
            } catch (e) {
              return {
                content: [{ type: "text", text: `Preview failed: ${e}` }],
                isError: true,
              };
            }
          }
        )
    );

    // Index stats
    api.registerTool(
      () =>
        makeTool(
          "session_stats",
          "Return FTS5 session index statistics: total records, sessions, and files indexed.",
          {},
          async () => {
            try {
              const result = await runPython(["stats"]);
              const stats = JSON.parse(result);
              return {
                content: [
                  {
                    type: "text",
                    text: `Session index: ${stats.total_records} messages across ${stats.total_sessions} sessions (${stats.indexed_files} files indexed)\nDB: ${stats.db_path}`,
                  },
                ],
              };
            } catch (e) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Stats unavailable — index may need building. Run session_index first. Error: ${e}`,
                  },
                ],
              };
            }
          }
        )
    );
  },
});
