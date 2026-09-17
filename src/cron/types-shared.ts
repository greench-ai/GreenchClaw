/**
 * Who created a cron job (2026-09-17 provenance instrumentation). Server-side
 * only — the gateway computes this from the RPC client at cron.add time; a
 * client-supplied value is overwritten and the wire schema rejects the field.
 */
export type CronJobCreatorKind = "cli" | "ui" | "mcp-loopback" | "internal";

export type CronJobCreator = {
  kind: CronJobCreatorKind;
  /** Client id / conn id / agent session key — whatever identifies the caller. */
  id?: string;
};

export type CronJobBase<TSchedule, TSessionTarget, TWakeMode, TPayload, TDelivery, TFailureAlert> =
  {
    id: string;
    agentId?: string;
    sessionKey?: string;
    name: string;
    description?: string;
    enabled: boolean;
    deleteAfterRun?: boolean;
    createdAtMs: number;
    updatedAtMs: number;
    schedule: TSchedule;
    sessionTarget: TSessionTarget;
    wakeMode: TWakeMode;
    payload: TPayload;
    delivery?: TDelivery;
    failureAlert?: TFailureAlert;
    createdBy?: CronJobCreator;
  };
