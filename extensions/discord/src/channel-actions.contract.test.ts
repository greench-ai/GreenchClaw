import { installChannelActionsContractSuite } from "GreenchClaw/plugin-sdk/channel-test-helpers";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import { describe } from "vitest";
import { discordPlugin } from "../api.js";

describe("discord actions contract", () => {
  installChannelActionsContractSuite({
    plugin: discordPlugin,
    cases: [
      {
        name: "describes configured Discord actions and capabilities",
        cfg: {
          channels: {
            discord: {
              token: "Bot token-main",
              actions: {
                polls: true,
                reactions: true,
                permissions: false,
                messages: false,
                pins: false,
                threads: false,
                search: false,
                stickers: false,
                memberInfo: false,
                roleInfo: false,
                emojiUploads: false,
                stickerUploads: false,
                channelInfo: false,
                channels: false,
                voiceStatus: false,
                events: false,
                roles: false,
                moderation: false,
                presence: false,
              },
            },
          },
        } as GreenchClawConfig,
        expectedActions: ["send", "poll", "react", "reactions", "emoji-list"],
        expectedCapabilities: ["presentation"],
      },
    ],
  });
});
