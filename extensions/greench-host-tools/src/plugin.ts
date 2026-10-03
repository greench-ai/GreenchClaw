/**
 * GreenchHostTools — host_bash tool for WSL2 host command execution.
 */

import { definePluginEntry, type AnyAgentTool, type GreenchClawPluginApi } from "GreenchClaw/plugin-sdk/plugin-entry";

function makeResult(
  text: string,
  details: Record<string, unknown> = {},
): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } {
  return { content: [{ type: "text" as const, text }], details };
}

export default definePluginEntry({
  id: "greench-host-tools",
  name: "GreenchHostTools",
  description: "Run commands on the Windows host from WSL2 via wsl.exe.",
  register(api: GreenchClawPluginApi) {
    api.registerTool(
      {
        name: "host_bash",
        label: "Host Bash",
        description: "Execute a bash command on the Windows host. Timeout: 30s.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Bash command to run on the host" },
            timeout_ms: {
              type: "number",
              description: "Timeout in ms (default: 30000)",
              default: 30000,
            },
          },
          required: ["command"],
        },
        execute: async (_toolCallId: string, toolParams: unknown, _signal?: AbortSignal) => {
          const { command, timeout_ms = 30000 } = toolParams as {
            command: string;
            timeout_ms?: number;
          };
          const { execFile } = await import("node:child_process");
          const timeout = Math.min(Math.max(timeout_ms, 1000), 120_000);

          try {
            const stdout: string = await new Promise((res, rej) =>
              execFile(
                "wsl",
                ["-e", "bash", "-c", command],
                { timeout, maxBuffer: 512_000 },
                (err, out, err2) =>
                  err ? rej(new Error(err2 || err.message)) : res(out),
              ),
            );
            return makeResult(stdout || "(no output)", { success: true });
          } catch (e) {
            return makeResult(`Error: ${String(e)}`, { success: false, error: String(e) });
          }
        },
      } as unknown as AnyAgentTool,
      { name: "host_bash" },
    );

    api.logger.info?.("greench-host-tools: registered");
  },
});
