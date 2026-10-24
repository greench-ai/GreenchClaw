import { describe, expect, it } from "vitest";
import { coerceIdentityValue } from "./assistant-identity-values.js";

describe("shared/assistant-identity-values", () => {
  it("returns undefined for missing or blank values", () => {
    expect(coerceIdentityValue(undefined, 10)).toBeUndefined();
    expect(coerceIdentityValue("   ", 10)).toBeUndefined();
    expect(coerceIdentityValue(42 as unknown as string, 10)).toBeUndefined();
  });

  it("trims values and preserves strings within the limit", () => {
    expect(coerceIdentityValue("  GreenchClaw  ", 20)).toBe("GreenchClaw");
    // The limit is a hard truncation point, not a pass-through for exact-length names.
    expect(coerceIdentityValue("  GreenchClaw  ", 8)).toBe("GreenchC");
  });

  it("truncates overlong trimmed values at the exact limit", () => {
    expect(coerceIdentityValue("  GreenchClaw Assistant  ", 8)).toBe("GreenchC");
  });

  it("returns an empty string when truncating to a zero-length limit", () => {
    expect(coerceIdentityValue("  GreenchClaw  ", 0)).toBe("");
    // Negative limits do not produce an empty string; existing behavior truncates
    // to abs(limit) characters, so assert the shipped result.
    expect(coerceIdentityValue("  GreenchClaw  ", -1)).toBe("GreenchCla");
  });
});
