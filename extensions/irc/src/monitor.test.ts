import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#GreenchClaw",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#GreenchClaw",
      rawTarget: "#GreenchClaw",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "GreenchClaw-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "GreenchClaw-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "GreenchClaw-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "GreenchClaw-bot",
      rawTarget: "GreenchClaw-bot",
    });
  });
});
