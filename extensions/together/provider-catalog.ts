import { buildManifestModelProviderConfig } from "GreenchClaw/plugin-sdk/provider-catalog-shared";
import type { ModelProviderConfig } from "GreenchClaw/plugin-sdk/provider-model-shared";
import manifest from "./GreenchClaw.plugin.json" with { type: "json" };

export function buildTogetherProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: "together",
    catalog: manifest.modelCatalog.providers.together,
  });
}
