/**
 * Standalone MCP server for selected built-in GreenchClaw tools.
 *
 * Run via: node --import tsx src/mcp/GreenchClaw-tools-serve.ts
 * Or: bun src/mcp/GreenchClaw-tools-serve.ts
 */
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { createCronTool } from "../agents/tools/cron-tool.js";
import { formatErrorMessage } from "../infra/errors.js";
import { connectToolsMcpServerToStdio, createToolsMcpServer } from "./tools-stdio-server.js";

export function resolveGreenchClawToolsForMcp(): AnyAgentTool[] {
  return [createCronTool()];
}

function createGreenchClawToolsMcpServer(
  params: {
    tools?: AnyAgentTool[];
  } = {},
): Server {
  const tools = params.tools ?? resolveGreenchClawToolsForMcp();
  return createToolsMcpServer({ name: "GreenchClaw-tools", tools });
}

async function serveGreenchClawToolsMcp(): Promise<void> {
  const server = createGreenchClawToolsMcpServer();
  await connectToolsMcpServerToStdio(server);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  serveGreenchClawToolsMcp().catch((err) => {
    process.stderr.write(`GreenchClaw-tools-serve: ${formatErrorMessage(err)}\n`);
    process.exit(1);
  });
}
