import { describe, expect, it } from "vitest";
import { buildVitestCapabilityShimAliasMap } from "./bundled-capability-runtime.js";

describe("buildVitestCapabilityShimAliasMap", () => {
  it("keeps scoped and unscoped capability shim aliases aligned", () => {
    const aliasMap = buildVitestCapabilityShimAliasMap();

    expect(aliasMap["GreenchClaw/plugin-sdk/config-runtime"]).toBe(
      aliasMap["@GreenchClaw/plugin-sdk/config-runtime"],
    );
    expect(aliasMap["GreenchClaw/plugin-sdk/media-runtime"]).toBe(
      aliasMap["@GreenchClaw/plugin-sdk/media-runtime"],
    );
    expect(aliasMap["GreenchClaw/plugin-sdk/provider-onboard"]).toBe(
      aliasMap["@GreenchClaw/plugin-sdk/provider-onboard"],
    );
    expect(aliasMap["GreenchClaw/plugin-sdk/speech-core"]).toBe(
      aliasMap["@GreenchClaw/plugin-sdk/speech-core"],
    );
  });
});
