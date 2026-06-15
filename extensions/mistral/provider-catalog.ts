import { buildManifestModelProviderConfig } from "GreenchClaw/plugin-sdk/provider-catalog-shared";
import type { ModelProviderConfig } from "GreenchClaw/plugin-sdk/provider-model-shared";
import manifest from "./GreenchClaw.plugin.json" with { type: "json" };

export function buildMistralProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: "mistral",
    catalog: manifest.modelCatalog.providers.mistral,
  });
}
