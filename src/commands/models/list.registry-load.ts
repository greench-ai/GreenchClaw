import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { resolveDefaultAgentDir } from "../../agents/agent-scope.js";
import { shouldSuppressBuiltInModel } from "../../agents/model-suppression.js";
import { discoverAuthStorage, discoverModels } from "../../agents/pi-model-discovery.js";
import type { GreenchClawConfig } from "../../config/types.GreenchClaw.js";
import { loadModelRegistry } from "./list.registry.js";
import type { ConfiguredEntry } from "./list.types.js";
import { modelKey } from "./shared.js";

export async function loadListModelRegistry(
  cfg: GreenchClawConfig,
  opts?: {
    providerFilter?: string;
    normalizeModels?: boolean;
    loadAvailability?: boolean;
    workspaceDir?: string;
  },
) {
  const loaded = await loadModelRegistry(cfg, opts);
  return {
    ...loaded,
    discoveredKeys: new Set(loaded.models.map((model) => modelKey(model.provider, model.id))),
  };
}

function findConfiguredRegistryModel(params: {
  registry: ModelRegistry;
  entry: ConfiguredEntry;
  cfg: GreenchClawConfig;
}): Model<Api> | undefined {
  const model = params.registry.find(params.entry.ref.provider, params.entry.ref.model);
  if (!model) {
    return undefined;
  }
  if (
    shouldSuppressBuiltInModel({
      provider: model.provider,
      id: model.id,
      baseUrl: model.baseUrl,
      config: params.cfg,
    })
  ) {
    return undefined;
  }
  return model;
}

export function loadConfiguredListModelRegistry(
  cfg: GreenchClawConfig,
  entries: ConfiguredEntry[],
  opts?: { providerFilter?: string; workspaceDir?: string },
) {
  const agentDir = resolveDefaultAgentDir(cfg);
  const authStorage = discoverAuthStorage(agentDir, {
    readOnly: true,
    config: cfg,
    workspaceDir: opts?.workspaceDir,
  });
  const registry = discoverModels(authStorage, agentDir, {
    providerFilter: opts?.providerFilter,
  });
  const discoveredKeys = new Set<string>();
  const availableKeys = new Set<string>();

  for (const entry of entries) {
    const model = findConfiguredRegistryModel({ registry, entry, cfg });
    if (!model) {
      continue;
    }
    const key = modelKey(model.provider, model.id);
    discoveredKeys.add(key);
    if (registry.hasConfiguredAuth(model)) {
      availableKeys.add(key);
    }
  }

  return {
    registry,
    discoveredKeys,
    availableKeys,
  };
}
