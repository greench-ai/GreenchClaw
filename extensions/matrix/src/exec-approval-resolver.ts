import { resolveApprovalOverGateway } from "GreenchClaw/plugin-sdk/approval-gateway-runtime";
import type { ExecApprovalReplyDecision } from "GreenchClaw/plugin-sdk/approval-runtime";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import { isApprovalNotFoundError } from "GreenchClaw/plugin-sdk/error-runtime";

export { isApprovalNotFoundError };

export async function resolveMatrixApproval(params: {
  cfg: GreenchClawConfig;
  approvalId: string;
  decision: ExecApprovalReplyDecision;
  senderId?: string | null;
  gatewayUrl?: string;
}): Promise<void> {
  await resolveApprovalOverGateway({
    cfg: params.cfg,
    approvalId: params.approvalId,
    decision: params.decision,
    senderId: params.senderId,
    gatewayUrl: params.gatewayUrl,
    clientDisplayName: `Matrix approval (${params.senderId?.trim() || "unknown"})`,
  });
}
