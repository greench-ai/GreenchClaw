import { normalizeOptionalLowercaseString } from "../../shared/string-coerce.js";

export const GATEWAY_CLIENT_IDS = {
  WEBCHAT_UI: "webchat-ui",
  CONTROL_UI: "GreenchClaw-control-ui",
  TUI: "GreenchClaw-tui",
  WEBCHAT: "webchat",
  CLI: "cli",
  GATEWAY_CLIENT: "gateway-client",
  MACOS_APP: "GreenchClaw-macos",
  IOS_APP: "GreenchClaw-ios",
  ANDROID_APP: "GreenchClaw-android",
  NODE_HOST: "node-host",
  TEST: "test",
  FINGERPRINT: "fingerprint",
  PROBE: "GreenchClaw-probe",
} as const;

export type GatewayClientId = (typeof GATEWAY_CLIENT_IDS)[keyof typeof GATEWAY_CLIENT_IDS];

// Back-compat naming (internal): these values are IDs, not display names.
export const GATEWAY_CLIENT_NAMES = GATEWAY_CLIENT_IDS;
export type GatewayClientName = GatewayClientId;

export const GATEWAY_CLIENT_MODES = {
  WEBCHAT: "webchat",
  CLI: "cli",
  UI: "ui",
  BACKEND: "backend",
  NODE: "node",
  PROBE: "probe",
  TEST: "test",
} as const;

export type GatewayClientMode = (typeof GATEWAY_CLIENT_MODES)[keyof typeof GATEWAY_CLIENT_MODES];

export type GatewayClientInfo = {
  id: GatewayClientId;
  displayName?: string;
  version: string;
  platform: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  mode: GatewayClientMode;
  instanceId?: string;
};

export const GATEWAY_CLIENT_CAPS = {
  TOOL_EVENTS: "tool-events",
} as const;

export type GatewayClientCap = (typeof GATEWAY_CLIENT_CAPS)[keyof typeof GATEWAY_CLIENT_CAPS];

// Canonical ids keep the brand's title case (`GreenchClaw-control-ui`), while inbound
// client names are compared case-insensitively — so the lookup set is lowercased.
const GATEWAY_CLIENT_ID_BY_LOWERCASE = new Map<string, GatewayClientId>(
  Object.values(GATEWAY_CLIENT_IDS).map((id) => [id.toLowerCase(), id]),
);
const GATEWAY_CLIENT_MODE_SET = new Set<GatewayClientMode>(Object.values(GATEWAY_CLIENT_MODES));

export function normalizeGatewayClientId(raw?: string | null): GatewayClientId | undefined {
  const normalized = normalizeOptionalLowercaseString(raw);
  if (!normalized) {
    return undefined;
  }
  return GATEWAY_CLIENT_ID_BY_LOWERCASE.get(normalized);
}

export function normalizeGatewayClientName(raw?: string | null): GatewayClientName | undefined {
  return normalizeGatewayClientId(raw);
}

export function normalizeGatewayClientMode(raw?: string | null): GatewayClientMode | undefined {
  const normalized = normalizeOptionalLowercaseString(raw);
  if (!normalized) {
    return undefined;
  }
  return GATEWAY_CLIENT_MODE_SET.has(normalized as GatewayClientMode)
    ? (normalized as GatewayClientMode)
    : undefined;
}

export function hasGatewayClientCap(
  caps: string[] | null | undefined,
  cap: GatewayClientCap,
): boolean {
  if (!Array.isArray(caps)) {
    return false;
  }
  return caps.includes(cap);
}
