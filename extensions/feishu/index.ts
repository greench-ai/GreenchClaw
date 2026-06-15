import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
} from "GreenchClaw/plugin-sdk/channel-entry-contract";
import type { GreenchClawPluginApi } from "GreenchClaw/plugin-sdk/channel-entry-contract";
import { registerFeishuSubagentHooks } from "./subagent-hooks-api.js";

function registerFeishuDocTools(api: GreenchClawPluginApi) {
  const register = loadBundledEntryExportSync<(api: GreenchClawPluginApi) => void>(
    import.meta.url,
    {
      specifier: "./api.js",
      exportName: "registerFeishuDocTools",
    },
  );
  register(api);
}

function registerFeishuChatTools(api: GreenchClawPluginApi) {
  const register = loadBundledEntryExportSync<(api: GreenchClawPluginApi) => void>(
    import.meta.url,
    {
      specifier: "./api.js",
      exportName: "registerFeishuChatTools",
    },
  );
  register(api);
}

function registerFeishuWikiTools(api: GreenchClawPluginApi) {
  const register = loadBundledEntryExportSync<(api: GreenchClawPluginApi) => void>(
    import.meta.url,
    {
      specifier: "./api.js",
      exportName: "registerFeishuWikiTools",
    },
  );
  register(api);
}

function registerFeishuDriveTools(api: GreenchClawPluginApi) {
  const register = loadBundledEntryExportSync<(api: GreenchClawPluginApi) => void>(
    import.meta.url,
    {
      specifier: "./api.js",
      exportName: "registerFeishuDriveTools",
    },
  );
  register(api);
}

function registerFeishuPermTools(api: GreenchClawPluginApi) {
  const register = loadBundledEntryExportSync<(api: GreenchClawPluginApi) => void>(
    import.meta.url,
    {
      specifier: "./api.js",
      exportName: "registerFeishuPermTools",
    },
  );
  register(api);
}

function registerFeishuBitableTools(api: GreenchClawPluginApi) {
  const register = loadBundledEntryExportSync<(api: GreenchClawPluginApi) => void>(
    import.meta.url,
    {
      specifier: "./api.js",
      exportName: "registerFeishuBitableTools",
    },
  );
  register(api);
}

export default defineBundledChannelEntry({
  id: "feishu",
  name: "Feishu",
  description: "Feishu/Lark channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "feishuPlugin",
  },
  secrets: {
    specifier: "./secret-contract-api.js",
    exportName: "channelSecrets",
  },
  runtime: {
    specifier: "./runtime-api.js",
    exportName: "setFeishuRuntime",
  },
  registerFull(api) {
    registerFeishuSubagentHooks(api);
    registerFeishuDocTools(api);
    registerFeishuChatTools(api);
    registerFeishuWikiTools(api);
    registerFeishuDriveTools(api);
    registerFeishuPermTools(api);
    registerFeishuBitableTools(api);
  },
});
