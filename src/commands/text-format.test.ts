import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("GreenchClaw", 16)).toBe("GreenchClaw");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("GreenchClaw-status-output", 10)).toBe("GreenchClaw-…");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
