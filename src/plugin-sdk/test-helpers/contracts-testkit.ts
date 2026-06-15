import type { PluginRegistryParams } from "../../plugins/registry-types.js";
import type { GreenchClawPluginApi } from "../plugin-entry.js";
import {
  createPluginRecord,
  createPluginRegistry,
  registerProviderPlugins as registerProviders,
  requireRegisteredProvider as requireProvider,
  type GreenchClawConfig,
  type PluginRecord,
  type PluginRuntime,
} from "../testing.js";
export { assertNoImportTimeSideEffects } from "./import-side-effects.js";
import { uniqueSortedStrings } from "./string-utils.js";

export { registerProviders, requireProvider, uniqueSortedStrings };

export function createPluginRegistryFixture(
  config = {} as GreenchClawConfig,
  params: { hostServices?: PluginRegistryParams["hostServices"] } = {},
) {
  return {
    config,
    registry: createPluginRegistry({
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {},
      },
      runtime: {} as PluginRuntime,
      ...(params.hostServices ? { hostServices: params.hostServices } : {}),
    }),
  };
}

export function registerTestPlugin(params: {
  registry: ReturnType<typeof createPluginRegistry>;
  config: GreenchClawConfig;
  record: PluginRecord;
  register(api: GreenchClawPluginApi): void;
}) {
  params.registry.registry.plugins.push(params.record);
  params.register(
    params.registry.createApi(params.record, {
      config: params.config,
    }),
  );
}

export function registerVirtualTestPlugin(params: {
  registry: ReturnType<typeof createPluginRegistry>;
  config: GreenchClawConfig;
  id: string;
  name: string;
  source?: string;
  kind?: PluginRecord["kind"];
  contracts?: PluginRecord["contracts"];
  register(this: void, api: GreenchClawPluginApi): void;
}) {
  registerTestPlugin({
    registry: params.registry,
    config: params.config,
    record: createPluginRecord({
      id: params.id,
      name: params.name,
      source: params.source ?? `/virtual/${params.id}/index.ts`,
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.contracts ? { contracts: params.contracts } : {}),
    }),
    register: params.register,
  });
}
