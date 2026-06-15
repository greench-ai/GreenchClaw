import {
  applyProviderConfigWithModelCatalogPreset,
  type GreenchClawConfig,
} from "GreenchClaw/plugin-sdk/provider-onboard";
import { normalizeOptionalString } from "GreenchClaw/plugin-sdk/string-coerce-runtime";
import {
  buildZaiCatalogModels,
  resolveZaiBaseUrl,
  ZAI_DEFAULT_MODEL_ID,
} from "./model-definitions.js";

export const ZAI_DEFAULT_MODEL_REF = `zai/${ZAI_DEFAULT_MODEL_ID}`;

function resolveZaiPresetBaseUrl(cfg: GreenchClawConfig, endpoint?: string): string {
  const existingProvider = cfg.models?.providers?.zai;
  const existingBaseUrl = normalizeOptionalString(existingProvider?.baseUrl) ?? "";
  return endpoint ? resolveZaiBaseUrl(endpoint) : existingBaseUrl || resolveZaiBaseUrl();
}

function applyZaiPreset(
  cfg: GreenchClawConfig,
  params?: { endpoint?: string; modelId?: string },
  primaryModelRef?: string,
): GreenchClawConfig {
  const modelId = normalizeOptionalString(params?.modelId) ?? ZAI_DEFAULT_MODEL_ID;
  const modelRef = `zai/${modelId}`;
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "zai",
    api: "openai-completions",
    baseUrl: resolveZaiPresetBaseUrl(cfg, params?.endpoint),
    catalogModels: buildZaiCatalogModels(),
    aliases: [{ modelRef, alias: "GLM" }],
    primaryModelRef,
  });
}

export function applyZaiProviderConfig(
  cfg: GreenchClawConfig,
  params?: { endpoint?: string; modelId?: string },
): GreenchClawConfig {
  return applyZaiPreset(cfg, params);
}

export function applyZaiConfig(
  cfg: GreenchClawConfig,
  params?: { endpoint?: string; modelId?: string },
): GreenchClawConfig {
  const modelId = normalizeOptionalString(params?.modelId) ?? ZAI_DEFAULT_MODEL_ID;
  const modelRef = modelId === ZAI_DEFAULT_MODEL_ID ? ZAI_DEFAULT_MODEL_REF : `zai/${modelId}`;
  return applyZaiPreset(cfg, params, modelRef);
}
