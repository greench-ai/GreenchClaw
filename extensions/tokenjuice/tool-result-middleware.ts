import process from "node:process";
import type {
  AgentToolResultMiddleware,
  AgentToolResultMiddlewareEvent,
  GreenchClawAgentToolResult,
} from "GreenchClaw/plugin-sdk/agent-harness";
import { createTokenjuiceGreenchClawEmbeddedExtension } from "./runtime-api.js";

type TokenjuiceToolResultHandler = (
  event: {
    toolName: string;
    input: Record<string, unknown>;
    content: GreenchClawAgentToolResult["content"];
    details: unknown;
    isError?: boolean;
  },
  ctx: { cwd: string },
) =>
  | Promise<Partial<GreenchClawAgentToolResult> | void>
  | Partial<GreenchClawAgentToolResult>
  | void;

function readCwd(event: AgentToolResultMiddlewareEvent): string {
  if (event.cwd?.trim()) {
    return event.cwd;
  }
  const workdir = event.args.workdir;
  if (typeof workdir === "string" && workdir.trim()) {
    return workdir;
  }
  return process.cwd();
}

export function createTokenjuiceAgentToolResultMiddleware(): AgentToolResultMiddleware {
  const handlers: TokenjuiceToolResultHandler[] = [];
  createTokenjuiceGreenchClawEmbeddedExtension()({
    on(event, handler) {
      if (event === "tool_result") {
        handlers.push(handler as TokenjuiceToolResultHandler);
      }
    },
  });

  return async (event) => {
    let current = event.result;
    for (const handler of handlers) {
      const next = await handler(
        {
          toolName: event.toolName,
          input: event.args,
          content: current.content,
          details: current.details,
          isError: event.isError,
        },
        { cwd: readCwd(event) },
      );
      if (next) {
        current = Object.assign({}, current, {
          content: next.content ?? current.content,
          details: next.details ?? current.details,
        });
      }
    }
    return current === event.result ? undefined : { result: current };
  };
}
