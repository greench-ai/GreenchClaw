/**
 * GreenchPrompts — JSON file-backed prompt template manager.
 * No extra dependencies. Stores prompts in ~/.GreenchClaw/prompts.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { definePluginEntry, type GreenchClawPluginApi } from "GreenchClaw/plugin-sdk/plugin-entry";

interface Prompt {
  id: number;
  name: string;
  content: string;
  description: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

function makeResult(
  text: string,
  details: Record<string, unknown> = {},
): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } {
  return { content: [{ type: "text" as const, text }], details };
}

function getPromptsPath(): string {
  const homedir = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
  const dir = join(homedir, ".GreenchClaw");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "prompts.json");
}

function loadPrompts(): Prompt[] {
  const path = getPromptsPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Prompt[];
  } catch {
    return [];
  }
}

function savePrompts(prompts: Prompt[]): void {
  writeFileSync(getPromptsPath(), JSON.stringify(prompts, null, 2), "utf-8");
}

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    variables[key] !== undefined ? variables[key] : `{{${key}}}`,
  );
}

// ── Plugin Entry ─────────────────────────────────────────────────────────────

export default definePluginEntry({
  id: "greench-prompts",
  name: "GreenchPrompts",
  description: "JSON file-backed prompt template manager with variable interpolation.",
  register(api: GreenchClawPluginApi) {
    api.registerTool(
      () => ({
        name: "prompts_list",
        description: "List all saved prompt templates.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          try {
            const prompts = loadPrompts();
            if (!prompts.length) return makeResult("No prompts saved yet.", { count: 0 });
            const lines = prompts.map(
              (p) =>
                `[${p.id}] **${p.name}** — ${p.description || "(no description)"} | vars: ${p.variables.join(", ") || "none"}`,
            );
            return makeResult(lines.join("\n"), { count: prompts.length });
          } catch (e) {
            return makeResult(`Error: ${e}`, { success: false, error: String(e) });
          }
        },
      }),
      { names: ["prompts_list"] },
    );

    api.registerTool(
      () => ({
        name: "prompts_get",
        description: "Get a prompt template with optional variable interpolation.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            variables: { type: "object", additionalProperties: { type: "string" } },
          },
          required: ["name"],
        },
        execute: async (_toolCallId, toolParams) => {
          try {
            const { name, variables = {} } = toolParams as {
              name: string;
              variables?: Record<string, string>;
            };
            const prompts = loadPrompts();
            const prompt = prompts.find((p) => p.name === name);
            if (!prompt) return makeResult(`Prompt "${name}" not found.`, { success: false });
            const filled = interpolate(prompt.content, variables);
            return makeResult(
              `**Prompt: ${prompt.name}**\n\n${filled}\n\nVariables: ${prompt.variables.join(", ") || "none"}`,
              { name: prompt.name, filled, variables: prompt.variables },
            );
          } catch (e) {
            return makeResult(`Error: ${e}`, { success: false, error: String(e) });
          }
        },
      }),
      { names: ["prompts_get"] },
    );

    api.registerTool(
      () => ({
        name: "prompts_create",
        description: "Create or update a prompt template.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            content: { type: "string" },
            description: { type: "string" },
            variables: { type: "array", items: { type: "string" } },
          },
          required: ["name", "content"],
        },
        execute: async (_toolCallId, toolParams) => {
          try {
            const {
              name,
              content,
              description = "",
              variables,
            } = toolParams as {
              name: string;
              content: string;
              description?: string;
              variables?: string[];
            };
            const prompts = loadPrompts();
            const vars = variables ?? [
              ...new Set([...content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])),
            ];
            const now = new Date().toISOString();
            const existing = prompts.find((p) => p.name === name);
            if (existing) {
              existing.content = content;
              existing.description = description;
              existing.variables = vars;
              existing.updated_at = now;
            } else {
              prompts.push({
                id: prompts.length ? Math.max(...prompts.map((p) => p.id)) + 1 : 1,
                name,
                content,
                description,
                variables: vars,
                created_at: now,
                updated_at: now,
              });
            }
            savePrompts(prompts);
            return makeResult(
              `Prompt "${name}" saved (${vars.length} variable${vars.length !== 1 ? "s" : ""}: ${vars.join(", ") || "none"})`,
              { name, variables: vars },
            );
          } catch (e) {
            return makeResult(`Error: ${e}`, { success: false, error: String(e) });
          }
        },
      }),
      { names: ["prompts_create"] },
    );

    api.registerTool(
      () => ({
        name: "prompts_delete",
        description: "Delete a prompt template.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
        execute: async (_toolCallId, toolParams) => {
          try {
            const { name } = toolParams as { name: string };
            const prompts = loadPrompts();
            const idx = prompts.findIndex((p) => p.name === name);
            if (idx === -1) return makeResult(`Prompt "${name}" not found.`, { success: false });
            prompts.splice(idx, 1);
            savePrompts(prompts);
            return makeResult(`Prompt "${name}" deleted.`, { name });
          } catch (e) {
            return makeResult(`Error: ${e}`, { success: false, error: String(e) });
          }
        },
      }),
      { names: ["prompts_delete"] },
    );

    api.logger.info?.("greench-prompts: registered");
  },
  tools: {
    prompts_list: { description: "List prompts.", inputSchema: { type: "object", properties: {} } },
    prompts_get: {
      description: "Get a prompt.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          variables: { type: "object", additionalProperties: { type: "string" } },
        },
        required: ["name"],
      },
    },
    prompts_create: {
      description: "Create a prompt.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          content: { type: "string" },
          description: { type: "string" },
          variables: { type: "array", items: { type: "string" } },
        },
        required: ["name", "content"],
      },
    },
    prompts_delete: {
      description: "Delete a prompt.",
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  },
});
