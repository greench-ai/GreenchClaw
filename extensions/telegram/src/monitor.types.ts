import type {
  ChannelAccountSnapshot,
  ChannelRuntimeSurface,
} from "GreenchClaw/plugin-sdk/channel-contract";
import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import type { RuntimeEnv } from "GreenchClaw/plugin-sdk/runtime-env";
import type { TelegramBotInfo } from "./bot-info.js";

export type MonitorTelegramOpts = {
  token?: string;
  accountId?: string;
  config?: GreenchClawConfig;
  runtime?: RuntimeEnv;
  channelRuntime?: ChannelRuntimeSurface;
  abortSignal?: AbortSignal;
  useWebhook?: boolean;
  webhookPath?: string;
  webhookPort?: number;
  webhookSecret?: string;
  webhookHost?: string;
  proxyFetch?: typeof fetch;
  webhookUrl?: string;
  webhookCertPath?: string;
  botInfo?: TelegramBotInfo;
  setStatus?: (patch: Omit<ChannelAccountSnapshot, "accountId">) => void;
};

export type TelegramMonitorFn = (opts?: MonitorTelegramOpts) => Promise<void>;
