import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import type { ToolLoopDetectionConfig } from "../config/types.tools.js";
import { resolveAgentConfig } from "./agent-scope.js";

export function resolveToolLoopDetectionConfig(params: {
  cfg?: GreenchClawConfig;
  agentId?: string;
}): ToolLoopDetectionConfig | undefined {
  const global = params.cfg?.tools?.loopDetection;
  const agent =
    params.agentId && params.cfg
      ? resolveAgentConfig(params.cfg, params.agentId)?.tools?.loopDetection
      : undefined;

  if (!agent) {
    return global;
  }
  if (!global) {
    return agent;
  }

  return {
    ...global,
    ...agent,
    detectors: {
      ...global.detectors,
      ...agent.detectors,
    },
    postCompactionGuard: {
      ...global.postCompactionGuard,
      ...agent.postCompactionGuard,
    },
  };
}
