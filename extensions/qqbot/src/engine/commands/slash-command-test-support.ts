import type { GreenchClawConfig } from "GreenchClaw/plugin-sdk/config-contracts";
import type { CommandsPort } from "../adapter/commands.port.js";
import { initCommands } from "./slash-commands-impl.js";

type RuntimeConfigApi = ReturnType<NonNullable<CommandsPort["approveRuntimeGetter"]>>["config"];
type ReplaceConfigFile = RuntimeConfigApi["replaceConfigFile"];
type ReplaceConfigFileResult = Awaited<ReturnType<ReplaceConfigFile>>;

export type WrittenQQBotConfig = {
  streaming?: unknown;
  accounts?: { default?: { streaming?: unknown } };
};

export function installCommandRuntime(
  currentConfig: GreenchClawConfig,
  writes: GreenchClawConfig[],
): void {
  const replaceConfigFile: ReplaceConfigFile = async (params) => {
    writes.push(params.nextConfig);
    return undefined as unknown as ReplaceConfigFileResult;
  };

  initCommands({
    resolveVersion: () => "test",
    pluginVersion: "0.0.0-test",
    approveRuntimeGetter: () => ({
      config: {
        current: () => currentConfig,
        replaceConfigFile,
      },
    }),
  });
}

export function getWrittenQQBotConfig(
  write: GreenchClawConfig | undefined,
): WrittenQQBotConfig | undefined {
  return write?.channels?.qqbot as WrittenQQBotConfig | undefined;
}
