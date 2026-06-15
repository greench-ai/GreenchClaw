import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";

export function makeQqbotSecretRefConfig(): GreenchClawConfig {
  return {
    channels: {
      qqbot: {
        appId: "123456",
        clientSecret: {
          source: "env",
          provider: "default",
          id: "QQBOT_CLIENT_SECRET",
        },
      },
    },
  } as GreenchClawConfig;
}

export function makeQqbotDefaultAccountConfig(): GreenchClawConfig {
  return {
    channels: {
      qqbot: {
        defaultAccount: "bot2",
        accounts: {
          bot2: { appId: "123456" },
        },
      },
    },
  } as GreenchClawConfig;
}
