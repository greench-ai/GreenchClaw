import { describe, expect, it } from "vitest";
import { isGreenchClawManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects GreenchClaw-managed device names", () => {
    expect(isGreenchClawManagedMatrixDevice("GreenchClaw Gateway")).toBe(true);
    expect(isGreenchClawManagedMatrixDevice("GreenchClaw Debug")).toBe(true);
    expect(isGreenchClawManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isGreenchClawManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale GreenchClaw-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "GreenchClaw Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "GreenchClaw Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "GreenchClaw Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary).toEqual({
      currentDeviceId: "du314Zpw3A",
      currentGreenchClawDevices: [
        {
          deviceId: "du314Zpw3A",
          displayName: "GreenchClaw Gateway",
          current: true,
        },
      ],
      staleGreenchClawDevices: [
        {
          deviceId: "BritdXC6iL",
          displayName: "GreenchClaw Gateway",
          current: false,
        },
        {
          deviceId: "G6NJU9cTgs",
          displayName: "GreenchClaw Debug",
          current: false,
        },
      ],
    });
  });
});
