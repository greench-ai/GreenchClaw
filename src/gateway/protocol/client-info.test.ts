import { describe, expect, it } from "vitest";
import {
  GATEWAY_CLIENT_IDS,
  GATEWAY_CLIENT_MODES,
  normalizeGatewayClientId,
  normalizeGatewayClientMode,
} from "./client-info.js";
import { isOperatorUiClient } from "../../utils/message-channel.js";

/**
 * Regression guard for the 2026-10-22 auth failure: client IDs are matched after
 * lowercasing, so any ID (or comparison basis) that keeps uppercase letters can
 * never match a normalized input and silently disables every "is this the
 * Control UI / TUI / app?" branch. These tests fail loudly if that returns.
 */
describe("gateway client ids", () => {
  it("every declared client id survives normalization round-trip", () => {
    for (const [key, id] of Object.entries(GATEWAY_CLIENT_IDS)) {
      expect(normalizeGatewayClientId(id), `${key} (${id}) must normalize to itself`).toBe(id);
    }
  });

  it("normalizes case-insensitively and returns the canonical id", () => {
    expect(normalizeGatewayClientId("GreenchClaw-Control-UI")).toBe(
      GATEWAY_CLIENT_IDS.CONTROL_UI,
    );
    expect(normalizeGatewayClientId("GREENCHCLAW-TUI")).toBe(GATEWAY_CLIENT_IDS.TUI);
    expect(normalizeGatewayClientId("greenchclaw-macos")).toBe(GATEWAY_CLIENT_IDS.MACOS_APP);
    expect(normalizeGatewayClientId("  WebChat  ")).toBe(GATEWAY_CLIENT_IDS.WEBCHAT);
  });

  it("rejects unknown ids", () => {
    expect(normalizeGatewayClientId("definitely-not-a-client")).toBeUndefined();
    expect(normalizeGatewayClientId("")).toBeUndefined();
    expect(normalizeGatewayClientId(undefined)).toBeUndefined();
  });

  it("recognises operator UI clients regardless of wire casing", () => {
    for (const id of [GATEWAY_CLIENT_IDS.CONTROL_UI, GATEWAY_CLIENT_IDS.TUI]) {
      expect(isOperatorUiClient({ id } as never), id).toBe(true);
      expect(isOperatorUiClient({ id: id.toUpperCase() } as never), id.toUpperCase()).toBe(true);
    }
    expect(isOperatorUiClient({ id: GATEWAY_CLIENT_IDS.CLI } as never)).toBe(false);
  });

  it("every declared client mode survives normalization round-trip", () => {
    for (const [key, mode] of Object.entries(GATEWAY_CLIENT_MODES)) {
      expect(normalizeGatewayClientMode(mode), key).toBe(mode);
    }
  });
});
