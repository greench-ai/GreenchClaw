import type { GreenchClawConfig } from "../../config/types.GreenchClaw.js";

type AgentToolsConfig = NonNullable<
  NonNullable<GreenchClawConfig["agents"]>["list"]
>[number]["tools"];
type SandboxToolsConfig = {
  allow?: string[];
  deny?: string[];
};

export function createRestrictedAgentSandboxConfig(params: {
  agentTools?: AgentToolsConfig;
  globalSandboxTools?: SandboxToolsConfig;
  workspace?: string;
}): GreenchClawConfig {
  return {
    agents: {
      defaults: {
        sandbox: {
          mode: "all",
          scope: "agent",
        },
      },
      list: [
        {
          id: "restricted",
          workspace: params.workspace ?? "~/GreenchClaw-restricted",
          sandbox: {
            mode: "all",
            scope: "agent",
          },
          ...(params.agentTools ? { tools: params.agentTools } : {}),
        },
      ],
    },
    ...(params.globalSandboxTools
      ? {
          tools: {
            sandbox: {
              tools: params.globalSandboxTools,
            },
          },
        }
      : {}),
  } as GreenchClawConfig;
}
