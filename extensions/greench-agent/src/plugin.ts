/**
 * GreenchAgent — autonomous agent loop with visible reasoning.
 */

import { parseModelRef } from "GreenchClaw/plugin-sdk/agent-runtime";
import { definePluginEntry, type GreenchClawPluginApi } from "GreenchClaw/plugin-sdk/plugin-entry";

const MAX_ITERATIONS = 8;
const REPETITION_LIMIT = 3;

// ── Safe Math ────────────────────────────────────────────────────────────────

function safeMath(expr: string): string {
  const s = expr.replace(/\s+/g, "");
  if (!/^[\d+\-*/().%]+$/.test(s)) throw new Error("Invalid characters");
  if (/\+\+|--|\.\.|\*\/|\/\*|\+\-|\-\+|\(\*|\(\/|\)\(/.test(s)) throw new Error("Invalid syntax");
  // eslint-disable-next-line no-new-func
  return String(new Function(`return (${s})`)());
}

// ── Tool Registry ─────────────────────────────────────────────────────────────

type ToolResult = { success: boolean; output: string; error: string | null };
type ToolRunner = (args: Record<string, unknown>, api: GreenchClawPluginApi) => Promise<ToolResult>;

const toolRegistry = new Map<string, ToolRunner>();
let toolsBuilt = false;

function buildTools(): void {
  if (toolsBuilt) return;
  toolsBuilt = true;

  const reg = (name: string, fn: ToolRunner) => toolRegistry.set(name, fn);

  reg("calculator", async (a) => {
    try {
      return { success: true, output: safeMath(String(a.expression ?? "")), error: null };
    } catch (e) {
      return { success: false, output: "", error: String(e) };
    }
  });

  reg("read_file", async (a) => {
    try {
      const { readFileSync } = await import("node:fs");
      return {
        success: true,
        output: readFileSync(String(a.path ?? ""), "utf-8").slice(0, 8000),
        error: null,
      };
    } catch (e) {
      return { success: false, output: "", error: String(e) };
    }
  });

  reg("ls", async (a) => {
    try {
      const { readdirSync, statSync } = await import("node:fs");
      const dir = String(a.path ?? ".");
      const entries = readdirSync(dir, { withFileTypes: true });
      const lines = entries.map((e) => {
        let size = "";
        try {
          size = String(statSync(`${dir}/${e.name}`).size).padStart(8);
        } catch {
          /* noop */
        }
        return `${e.isDirectory() ? "d" : "-"}${size} ${e.name}`;
      });
      return { success: true, output: lines.join("\n"), error: null };
    } catch (e) {
      return { success: false, output: "", error: String(e) };
    }
  });

  reg("grep", async (a) => {
    try {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(String(a.path ?? ""), "utf-8");
      const matches = content
        .split("\n")
        .filter((l) => new RegExp(String(a.pattern ?? ""), "gi").test(l));
      return {
        success: true,
        output: matches.length ? matches.join("\n") : "(no matches)",
        error: null,
      };
    } catch (e) {
      return { success: false, output: "", error: String(e) };
    }
  });

  reg("fetch_url", async (a) => {
    try {
      const resp = await fetch(String(a.url ?? ""), {
        headers: { "User-Agent": "GreenchClaw/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      return { success: true, output: (await resp.text()).slice(0, 4000), error: null };
    } catch (e) {
      return { success: false, output: "", error: String(e) };
    }
  });

  reg("web_search", async (a) => {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key)
      return {
        success: true,
        output: `Web search — set BRAVE_SEARCH_API_KEY to enable.`,
        error: null,
      };
    try {
      const resp = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(String(a.query ?? ""))}&count=5`,
        {
          headers: { Accept: "application/json", "X-Subscription-Token": key },
          signal: AbortSignal.timeout(10000),
        },
      );
      const data = (await resp.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      };
      const results = data.web?.results ?? [];
      if (!results.length) return { success: true, output: "No results.", error: null };
      return {
        success: true,
        output: results
          .map((r, i) => `[${i + 1}] ${r.title}\n  ${r.url}\n  ${r.description ?? ""}`)
          .join("\n\n"),
        error: null,
      };
    } catch (e) {
      return { success: false, output: "", error: String(e) };
    }
  });

  reg("wikipedia", async (a) => {
    try {
      const resp = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(a.topic ?? "").trim())}`,
        { headers: { "User-Agent": "GreenchClaw/1.0" }, signal: AbortSignal.timeout(5000) },
      );
      if (!resp.ok) return { success: false, output: "", error: `HTTP ${resp.status}` };
      const d = (await resp.json()) as { title?: string; extract?: string };
      return {
        success: true,
        output: `**${d.title ?? a.topic}**\n\n${d.extract ?? "No summary."}`,
        error: null,
      };
    } catch (e) {
      return { success: false, output: "", error: String(e) };
    }
  });

  reg("bash", async (a) => {
    try {
      const { execFile } = await import("node:child_process");
      const out: string = await new Promise((res, rej) =>
        execFile(
          String(a.command ?? ""),
          { timeout: 15000, maxBuffer: 512_000 },
          (err, stdout, stderr) => (err ? rej(new Error(stderr || err.message)) : res(stdout)),
        ),
      );
      return { success: true, output: out.slice(0, 4000), error: null };
    } catch (e) {
      return { success: false, output: "", error: String(e) };
    }
  });
}

// ── Response Parser ───────────────────────────────────────────────────────────

const THOUGHT_RE = /thought:\s*(.+?)(?=\n(?:action:|final:)|$)/is;
const FINAL_RE = /final:\s*(.+)/is;
const ACTION_RE = /action:\s*(\w+)\s*(.+?)(?=\n(?:tool_result|thought|final)|$)/s;

function parseResponse(text: string) {
  return {
    thought: THOUGHT_RE.exec(text)?.[1].trim() ?? null,
    final: FINAL_RE.exec(text)?.[1].trim() ?? null,
    toolName: ACTION_RE.exec(text)?.[1].trim() ?? null,
    toolArgs: ACTION_RE.exec(text)?.[2].trim() ?? null,
  };
}

function buildSystemPrompt(): string {
  return `You are a precise, autonomous AI agent that completes tasks step-by-step.

## Available Tools
${[...toolRegistry.keys()].map((n) => `- **${n}**`).join("\n")}

## Response Format

\`\`\`
thought: Your reasoning.
action: <tool> {"arg": "value"}
\`\`\`

\`\`\`
tool_result: Result.
thought: Next step.
action: <tool> {"arg": "value"}
\`\`\`

\`\`\`
tool_result: Result.
thought: I have the answer.
final: Your final answer here.
\`\`\`

## Rules
- Always write thought: before any action
- Never call the same tool 3x in a row without making progress
- When you have a verified answer, use final:`;
}

// ── Completion helper ─────────────────────────────────────────────────────────

async function runCompletion(
  params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens: number;
    temperature: number;
  },
  api: GreenchClawPluginApi,
  signal: AbortSignal,
): Promise<string> {
  try {
    const ar = api.runtime?.agent as {
      sessions?: { current?: { complete: (o: unknown) => Promise<string> } };
    } & Record<string, unknown>;
    if (ar?.sessions?.current?.complete) {
      return await ar.sessions.current.complete({
        model: params.model,
        messages: params.messages,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
      });
    }
  } catch {
    /* fall through */
  }

  const { provider, modelId } = parseModelRef(params.model);
  const cfg =
    (((api.config.models?.providers as Record<string, unknown> | undefined) ?? {})[
      provider
    ] as Record<string, unknown>) ?? {};
  const baseUrl = String(cfg["baseUrl"] ?? "");
  const apiKey = String(cfg["apiKey"] ?? "");
  const apiStyle = String(cfg["api"] ?? "openai");

  if (!baseUrl) throw new Error(`No baseUrl for: ${provider}`);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey && apiKey !== "***") headers["Authorization"] = `Bearer ${apiKey}`;

  let url = `${baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: modelId,
    messages: params.messages,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
  };
  if (apiStyle === "anthropic-messages") {
    url = `${baseUrl}/v1/messages`;
    delete body.model;
  }

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!resp.ok) throw new Error(`API ${resp.status}`);

  if (apiStyle === "anthropic-messages") {
    return (
      ((await resp.json()) as { content?: Array<{ type?: string; text?: string }> }).content?.[0]
        ?.text ?? ""
    );
  }
  return (
    ((await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
      ?.message?.content ?? ""
  );
}

// ── Agent Run ────────────────────────────────────────────────────────────────

let _api: GreenchClawPluginApi;

async function runAgent(task: string, model: string): Promise<{ output: string }> {
  const steps: string[] = [];
  let finalAnswer = "";
  let agentError: string | null = null;
  let toolCalls = 0;
  const abortController = new AbortController();

  const toolResults: Array<{ tool: string; output: string; error: string | null }> = [];
  let lastTool: string | null = null;
  let sameCount = 0;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: task },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (abortController.signal.aborted) break;

    const conversation = [
      ...messages,
      ...toolResults.map((tr) => ({
        role: "user" as const,
        content: `Tool result for ${tr.tool}:\n${tr.output}${tr.error ? `\nError: ${tr.error}` : ""}`,
      })),
    ];

    let responseText: string;
    try {
      responseText = await runCompletion(
        { model, messages: conversation, maxTokens: 2048, temperature: 0.3 },
        _api,
        abortController.signal,
      );
    } catch (e) {
      agentError = String(e);
      break;
    }

    const { thought, final, toolName, toolArgs } = parseResponse(responseText);
    if (thought) steps.push(`**Thought:** ${thought}`);
    if (final) {
      finalAnswer = final;
      break;
    }
    if (!toolName) {
      finalAnswer = responseText.trim() || "No response.";
      break;
    }

    if (toolName === lastTool) sameCount++;
    else {
      sameCount = 1;
      lastTool = toolName;
    }
    if (sameCount >= REPETITION_LIMIT) {
      steps.push(`[Stopped: ${toolName} repeated ${REPETITION_LIMIT}x]`);
      agentError = `Stopped: ${toolName} called repeatedly`;
      break;
    }

    let toolInput: Record<string, unknown> = {};
    if (toolArgs)
      try {
        toolInput = JSON.parse(toolArgs);
      } catch {
        toolInput = { input: toolArgs };
      }

    if (!toolRegistry.has(toolName)) {
      steps.push(`**Result (${toolName}):** ERROR: unknown tool`);
      continue;
    }

    steps.push(`**Action:** ${toolName} ${JSON.stringify(toolInput)}`);
    toolCalls++;
    const result = await toolRegistry.get(toolName)!(toolInput, _api);
    const truncated =
      result.output.length > 300 ? result.output.slice(0, 300) + "..." : result.output;
    steps.push(`**Result (${toolName}):** ${result.error ? `ERROR: ${result.error}` : truncated}`);
    toolResults.push({ tool: toolName, output: result.output, error: result.error });
  }

  const header = `**Agent Run** — ${toolCalls} tool(s), ${steps.filter((s) => s.startsWith("**Thought")).length} thought(s)\n\n`;
  const body = steps.map((s) => `  ${s}`).join("\n\n");
  const finalStr = finalAnswer ? `\n\n**Final Answer:**\n${finalAnswer}` : "";
  const errStr = agentError ? `\n\n**Error:** ${agentError}` : "";

  return { output: header + body + finalStr + errStr };
}

// ── Plugin Entry ─────────────────────────────────────────────────────────────

export default definePluginEntry({
  id: "greench-agent",
  name: "GreenchAgent",
  description: "Autonomous agent with visible reasoning — think → act → observe loop with 8 tools.",
  register(api: GreenchClawPluginApi) {
    _api = api;
    buildTools();

    api.registerTool(
      () => ({
        name: "agent_run",
        description: "Run an autonomous agent for complex tasks. Visible thought process.",
        inputSchema: {
          type: "object",
          properties: { task: { type: "string" }, model: { type: "string" } },
          required: ["task"],
        },
        execute: async (_toolCallId, toolParams, _signal) => {
          const { task, model: modelArg } = toolParams as { task: string; model?: string };
          const model = modelArg ?? _api.runtime.agent.model?.() ?? "minimax/MiniMax-M2.7";
          const { output } = await runAgent(task, model);
          return {
            content: [{ type: "text" as const, text: output }],
            details: { success: true },
          };
        },
      }),
      { names: ["agent_run"] },
    );

    api.logger.info?.("greench-agent: registered", { tools: [...toolRegistry.keys()].join(", ") });
  },
  tools: {
    agent_run: {
      description: "Autonomous agent run.",
      inputSchema: {
        type: "object",
        properties: { task: { type: "string" }, model: { type: "string" } },
        required: ["task"],
      },
    },
  },
});
