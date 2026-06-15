import { resolveDefaultModelForAgent } from "../agents/model-selection.js";
import type { GreenchClawConfig } from "../config/config.js";

export function resolveCommitmentDefaultModelRef(params: {
  cfg: GreenchClawConfig;
  agentId?: string;
}): { provider: string; model: string } {
  return resolveDefaultModelForAgent(params);
}
