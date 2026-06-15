/**
 * GreenchFocus — focus modes that shape agent behavior.
 */

import { definePluginEntry, type GreenchClawPluginApi } from "GreenchClaw/plugin-sdk/plugin-entry";

// ── Mode Definitions ─────────────────────────────────────────────────────────

interface FocusMode {
  id: string;
  name: string;
  emoji: string;
  description: string;
  systemPromptSuffix: string;
  relevantTools: string[];
}

const FOCUS_MODES: FocusMode[] = [
  {
    id: "copilot",
    name: "Copilot",
    emoji: "🤖",
    description: "Pair programmer. Short explanations, code snippets.",
    systemPromptSuffix:
      "\n\n[Focus: Copilot] Keep responses short and code-focused. Prefer snippets over prose.",
    relevantTools: ["read_file", "grep", "bash", "agent_run"],
  },
  {
    id: "academic",
    name: "Academic",
    emoji: "📚",
    description: "Deep research. Structured, nuanced, thorough.",
    systemPromptSuffix:
      "\n\n[Focus: Academic] Prioritize depth, accuracy, and structured analysis. Cite sources.",
    relevantTools: ["web_search", "fetch_url", "wikipedia", "brain_search"],
  },
  {
    id: "writing",
    name: "Writing",
    emoji: "✍️",
    description: "Prose-first. Flowing text, minimal bullet points.",
    systemPromptSuffix: "\n\n[Focus: Writing] Prioritize flowing prose. Match the user's voice.",
    relevantTools: ["brain_search", "read_file"],
  },
  {
    id: "coding",
    name: "Coding",
    emoji: "💻",
    description: "Clean code, architecture, tests, precise explanations.",
    systemPromptSuffix:
      "\n\n[Focus: Coding] Prioritize correct, maintainable code. Name things well.",
    relevantTools: ["read_file", "grep", "ls", "bash", "agent_run"],
  },
  {
    id: "agent",
    name: "Agent",
    emoji: "🚀",
    description: "Autonomous execution. Report back only when done.",
    systemPromptSuffix: "\n\n[Focus: Agent] Make decisions without asking. Execute fully.",
    relevantTools: ["agent_run", "bash", "web_search", "read_file"],
  },
];

let activeMode: FocusMode | null = null;

function makeResult(
  text: string,
  details: Record<string, unknown> = {},
): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } {
  return { content: [{ type: "text" as const, text }], details };
}

// ── Plugin Entry ─────────────────────────────────────────────────────────────

export default definePluginEntry({
  id: "greench-focus",
  name: "GreenchFocus",
  description: "Focus modes — copilot / academic / writing / coding / agent.",
  register(api: GreenchClawPluginApi) {
    api.registerTool(
      () => ({
        name: "focus_mode",
        description: "Set or clear the active focus mode.",
        inputSchema: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["copilot", "academic", "writing", "coding", "agent", "off"],
            },
          },
          required: ["mode"],
        },
        execute: async (_toolCallId, toolParams) => {
          const { mode } = toolParams as { mode: string };
          if (mode === "off") {
            activeMode = null;
            return makeResult("Focus mode cleared.");
          }
          const m = FOCUS_MODES.find((f) => f.id === mode);
          if (!m)
            return makeResult(
              `Unknown mode. Available: ${FOCUS_MODES.map((f) => f.id).join(", ")}`,
              { success: false },
            );
          activeMode = m;
          return makeResult(
            `${m.emoji} Focus mode: **${m.name}**\n\n${m.description}\n\nRelevant tools: ${m.relevantTools.join(", ")}`,
            { mode: m.id },
          );
        },
      }),
      { names: ["focus_mode"] },
    );

    api.registerTool(
      () => ({
        name: "focus_modes_list",
        description: "List all available focus modes.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          const cur = activeMode?.id ?? "none";
          const lines = FOCUS_MODES.map(
            (m) =>
              `${m.id === cur ? "→" : " "} **${m.emoji} ${m.name}** (\`${m.id}\`)\n   ${m.description}\n   tools: ${m.relevantTools.join(", ")}`,
          );
          return makeResult(`**Focus Modes** (current: ${cur})\n\n${lines.join("\n\n")}`, {
            current: cur,
          });
        },
      }),
      { names: ["focus_modes_list"] },
    );

    api.logger.info?.("greench-focus: registered", {
      modes: FOCUS_MODES.map((m) => m.id).join(", "),
    });
  },
  tools: {
    focus_mode: {
      description: "Set focus mode.",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["copilot", "academic", "writing", "coding", "agent", "off"],
          },
        },
        required: ["mode"],
      },
    },
    focus_modes_list: {
      description: "List modes.",
      inputSchema: { type: "object", properties: {} },
    },
  },
});
