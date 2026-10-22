import { describe, expect, it } from "vitest";
import { ensureControlUiAllowedOriginsForNonLoopbackBind } from "./gateway-control-ui-origins.js";

describe("ensureControlUiAllowedOriginsForNonLoopbackBind", () => {
  it("seeds Fly-style runtime bind and port when config is empty", () => {
    const result = ensureControlUiAllowedOriginsForNonLoopbackBind(
      { gateway: {} },
      {
        runtimeBind: "lan",
        runtimePort: 3000,
        isContainerEnvironment: () => false,
      },
    );

    expect(result.bind).toBe("lan");
    expect(result.seededOrigins).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
    expect(result.config.gateway?.controlUi?.allowedOrigins).toEqual(result.seededOrigins);
  });

  it("uses runtime bind before config bind to match gateway startup precedence", () => {
    const result = ensureControlUiAllowedOriginsForNonLoopbackBind(
      { gateway: { bind: "loopback" } },
      {
        runtimeBind: "lan",
        isContainerEnvironment: () => false,
      },
    );

    expect(result.bind).toBe("lan");
    // Port defaults are not pinned here: buildDefaultControlUiAllowedOrigins uses the
    // gateway's default port, which tracks the rebrand. Assert shape, not a literal.
    expect(result.seededOrigins).toHaveLength(2);
    expect(result.seededOrigins?.[0]).toMatch(/^http:\/\/localhost:\d+$/);
    expect(result.seededOrigins?.[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(result.seededOrigins?.[0]?.split(":").pop()).toBe(
      result.seededOrigins?.[1]?.split(":").pop(),
    );
  });

  it("uses runtime loopback before config non-loopback and avoids seeding", () => {
    const result = ensureControlUiAllowedOriginsForNonLoopbackBind(
      { gateway: { bind: "lan" } },
      {
        runtimeBind: "loopback",
        isContainerEnvironment: () => false,
      },
    );

    expect(result.bind).toBeNull();
    expect(result.seededOrigins).toBeNull();
  });

  it("uses runtime port before config port to match gateway startup precedence", () => {
    const result = ensureControlUiAllowedOriginsForNonLoopbackBind(
      { gateway: { bind: "lan", port: 18789 } },
      {
        runtimePort: 3000,
        isContainerEnvironment: () => false,
      },
    );

    expect(result.seededOrigins).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
  });

  it("keeps container fallback when runtime and config bind are unset", () => {
    const result = ensureControlUiAllowedOriginsForNonLoopbackBind(
      { gateway: {} },
      { isContainerEnvironment: () => true },
    );

    expect(result.bind).toBe("auto");
    // Container fallback seeds loopback origins on the default port (shape, not literal).
    expect(result.seededOrigins).toHaveLength(2);
    expect(result.seededOrigins?.[0]).toMatch(/^http:\/\/localhost:\d+$/);
    expect(result.seededOrigins?.[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(result.seededOrigins?.[0]?.split(":").pop()).toBe(
      result.seededOrigins?.[1]?.split(":").pop(),
    );
  });

  it("does not overwrite explicit allowed origins", () => {
    const result = ensureControlUiAllowedOriginsForNonLoopbackBind(
      {
        gateway: {
          controlUi: { allowedOrigins: ["https://control.example.com"] },
        },
      },
      {
        runtimeBind: "lan",
        runtimePort: 3000,
        isContainerEnvironment: () => false,
      },
    );

    expect(result.bind).toBe("lan");
    expect(result.seededOrigins).toBeNull();
    expect(result.config.gateway?.controlUi?.allowedOrigins).toEqual([
      "https://control.example.com",
    ]);
  });
});
