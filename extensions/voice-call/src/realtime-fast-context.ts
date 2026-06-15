import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import {
  resolveRealtimeVoiceFastContextConsult,
  type RealtimeVoiceFastContextConsultResult,
  type RealtimeVoiceFastContextConfig,
} from "GreenchClaw/plugin-sdk/realtime-voice";

type Logger = {
  debug?: (message: string) => void;
};

export async function resolveRealtimeFastContextConsult(params: {
  cfg: GreenchClawConfig;
  agentId: string;
  sessionKey: string;
  config: RealtimeVoiceFastContextConfig;
  args: unknown;
  logger: Logger;
}): Promise<RealtimeVoiceFastContextConsultResult> {
  return await resolveRealtimeVoiceFastContextConsult({
    ...params,
    labels: {
      audienceLabel: "caller",
      contextName: "GreenchClaw memory or session context",
    },
  });
}
