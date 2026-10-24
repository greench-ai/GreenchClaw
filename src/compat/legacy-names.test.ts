import { describe, expect, it } from "vitest";
import { LEGACY_MANIFEST_KEYS, MANIFEST_KEY, PROJECT_NAME } from "./legacy-names.js";

describe("compat/legacy-names", () => {
  it("keeps the current manifest key primary while exposing legacy fallbacks", () => {
    expect(PROJECT_NAME).toBe("GreenchClaw");
    expect(MANIFEST_KEY).toBe("GreenchClaw");
    // "openclaw" is the upstream pre-rebrand key; hook packs published under it
    // must keep installing (see hooks/install.test.ts tar fixtures).
    expect(LEGACY_MANIFEST_KEYS).toEqual(["clawdbot", "openclaw"]);
  });
});
