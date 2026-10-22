import { normalizeOptionalLowercaseString } from "../../shared/string-coerce.js";

export const GATEWAY_CLIENT_IDS = {
  WEBCHAT_UI: "webchat-ui",
  // Branded casing preserved for wire compatibility with existing clients
  // (Control UI, TUI, iOS/Android apps send these exact strings); matching is
  // case-insensitive via normalizeGatewayClientId, which lowercases both sides.
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

// Built from lowercased values so a normalized input can always match. Keep the
// set derived (never hand-maintained) — a drifted set is exactly how the
// mixed-case ID bug slipped through.
const GATEWAY_CLIENT_ID_SET = new Set<string>(
  Object.values(GATEWAY_CLIENT_IDS).map((id) => id.toLowerCase()),
);
const GATEWAY_CLIENT_MODE_SET = new Set<GatewayClientMode>(Object.values(GATEWAY_CLIENT_MODES));

export function normalizeGatewayClientId(raw?: string | null): GatewayClientId | undefined {
  const normalized = normalizeOptionalLowercaseString(raw);
  if (!normalized) {
    return undefined;
  }
  if (!GATEWAY_CLIENT_ID_SET.has(normalized)) {
    return undefined;
  }
  // Return the canonical (branded) constant, not the lowercased input: callers
  // compare against GATEWAY_CLIENT_NAMES.* which keeps the wire casing.
  const canonical = Object.values(GATEWAY_CLIENT_IDS).find(
    (id) => id.toLowerCase() === normalized,
  );
  return canonical ?? (normalized as GatewayClientId);
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
