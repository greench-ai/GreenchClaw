import { describe, expect, it } from "vitest";
import { formatCliFailureLines } from "./failure-output.js";

describe("formatCliFailureLines", () => {
  it("shows a concise reason and recovery commands by default", () => {
    const lines = formatCliFailureLines({
      title: "Could not start the CLI.",
      error: new Error("config file is invalid"),
      argv: ["node", "GreenchClaw", "status"],
      env: {},
    });

    expect(lines).toContain("[GreenchClaw] Could not start the CLI.");
    expect(lines).toContain("[GreenchClaw] Reason: config file is invalid");
    expect(lines).toContain(
      "[GreenchClaw] Debug: set GREENCHCLAW_DEBUG=1 to include the stack trace.",
    );
    expect(lines).toContain("[GreenchClaw] Try: GreenchClaw doctor");
    expect(lines).toContain("[GreenchClaw] Help: GreenchClaw --help");
  });

  it("prints stack details when debug output is requested", () => {
    const lines = formatCliFailureLines({
      title: "The CLI command failed.",
      error: new Error("boom"),
      env: { GREENCHCLAW_DEBUG: "1" },
    });

    expect(lines).toContain("[GreenchClaw] Stack:");
    expect(lines.some((line) => line.includes("Error: boom"))).toBe(true);
  });
});
