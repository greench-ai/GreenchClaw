import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";

export function isGatewayModelPricingEnabled(config: GreenchClawConfig): boolean {
  return config.models?.pricing?.enabled !== false;
}
