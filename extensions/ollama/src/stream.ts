import { randomUUID } from "node:crypto";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type {
  AssistantMessage,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall,
  Tool,
  Usage,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream, streamSimple } from "@earendil-works/pi-ai";
import { formatErrorMessage } from "GreenchClaw/plugin-sdk/error-runtime";
import type {
  GreenchClawConfig,
  ProviderRuntimeModel,
  ProviderWrapStreamFnContext,
} from "GreenchClaw/plugin-sdk/plugin-entry";
import { isNonSecretApiKeyMarker } from "GreenchClaw/plugin-sdk/provider-auth";
import {
  DEFAULT_CONTEXT_TOKENS,
  normalizeProviderId,
} from "GreenchClaw/plugin-sdk/provider-model-shared";
import {
  createMoonshotThinkingWrapper,
  resolveMoonshotThinkingType,
  streamWithPayloadPatch,
} from "GreenchClaw/plugin-sdk/provider-stream-shared";
import { createSubsystemLogger } from "GreenchClaw/plugin-sdk/runtime-env";
import { fetchWithSsrFGuard } from "GreenchClaw/plugin-sdk/ssrf-runtime";
import {
  normalizeLowercaseStringOrEmpty,
  readStringValue,
} from "GreenchClaw/plugin-sdk/string-coerce-runtime";
import { OLLAMA_DEFAULT_BASE_URL } from "./defaults.js";
import { normalizeOllamaWireModelId } from "./model-id.js";
import {
  parseJsonObjectPreservingUnsafeIntegers,
  parseJsonPreservingUnsafeIntegers,
} from "./ollama-json.js";
import { buildOllamaBaseUrlSsrFPolicy } from "./provider-models.js";

const log = createSubsystemLogger("ollama-stream");

export const OLLAMA_NATIVE_BASE_URL = OLLAMA_DEFAULT_BASE_URL;

const GARBLED_VISIBLE_TEXT_MODEL_RE = /\b(?:glm|kimi)\b/i;
const GARBLED_VISIBLE_TEXT_MIN_CHARS = 80;
const GARBLED_VISIBLE_TEXT_SYMBOL_RE = /[$#%&="'_~`^|\\/*+\-[\]{}()<>:;,.!?]/gu;
const LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/gu;

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0;
  return Array.from(text.matchAll(re)).length;
}

function maxCharacterFrequency(text: string): number {
  const counts = new Map<string, number>();
  let max = 0;
  for (const char of text) {
    const count = (counts.get(char) ?? 0) + 1;
    counts.set(char, count);
    max = Math.max(max, count);
  }
  return max;
}

function isKnownOllamaGarbledVisibleTextModel(modelId: string): boolean {
  return GARBLED_VISIBLE_TEXT_MODEL_RE.test(modelId);
}

function isLikelyGarbledVisibleText(params: { text: string; modelId: string }): boolean {
  if (!isKnownOllamaGarbledVisibleTextModel(params.modelId)) {
    return false;
  }
  const compact = params.text.replace(/\s+/g, "");
  if (compact.length < GARBLED_VISIBLE_TEXT_MIN_CHARS) {
    return false;
  }

  const letterOrDigitCount = countMatches(compact, LETTER_OR_DIGIT_RE);
  const symbolCount = countMatches(compact, GARBLED_VISIBLE_TEXT_SYMBOL_RE);
  const maxFrequency = maxCharacterFrequency(compact);
  const letterOrDigitRatio = letterOrDigitCount / compact.length;
  const symbolRatio = symbolCount / compact.length;
  const dominantCharacterRatio = maxFrequency / compact.length;

  return (
    letterOrDigitRatio < 0.08 &&
    symbolRatio > 0.6 &&
    (dominantCharacterRatio > 0.22 || /[$#%&="'_~`^|\\/*+\-[\]{}()<>:;,.!?]{12,}/u.test(compact))
  );
}

export function resolveOllamaBaseUrlForRun(params: {
  modelBaseUrl?: string;
  providerBaseUrl?: string;
}): string {
  const providerBaseUrl = params.providerBaseUrl?.trim();
  if (providerBaseUrl) {
    return providerBaseUrl;
  }
  const modelBaseUrl = params.modelBaseUrl?.trim();
  if (modelBaseUrl) {
    return modelBaseUrl;
  }
  return OLLAMA_NATIVE_BASE_URL;
}

export function resolveConfiguredOllamaProviderConfig(params: {
  config?: GreenchClawConfig;
  providerId?: string;
}) {
  const providerId = params.providerId?.trim();
  if (!providerId) {
    return undefined;
  }
  const providers = params.config?.models?.providers;
  if (!providers) {
    return undefined;
  }
  const direct = providers[providerId];
  if (direct) {
    return direct;
  }
  const normalized = normalizeProviderId(providerId);
  for (const [candidateId, candidate] of Object.entries(providers)) {
    if (normalizeProviderId(candidateId) === normalized) {
      return candidate;
    }
  }
  return undefined;
}

export function isOllamaCompatProvider(model: {
  provider?: string;
  baseUrl?: string;
  api?: string;
}): boolean {
  const providerId = normalizeProviderId(model.provider ?? "");
  if (providerId === "ollama") {
    return true;
  }
  if (!model.baseUrl) {
    return false;
  }
  try {
    const parsed = new URL(model.baseUrl);
    const hostname = normalizeLowercaseStringOrEmpty(parsed.hostname);
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]";
    if (isLocalhost && parsed.port === "11434") {
      return true;
    }

    // Allow remote/LAN Ollama OpenAI-compatible endpoints when the provider id
    // itself indicates Ollama usage (for example "my-ollama").
    const providerHintsOllama = providerId.includes("ollama");
    const isOllamaPort = parsed.port === "11434";
    const isOllamaCompatPath = parsed.pathname === "/" || /^\/v1\/?$/i.test(parsed.pathname);
    return providerHintsOllama && isOllamaPort && isOllamaCompatPath;
  } catch {
    return false;
  }
}

export function resolveOllamaCompatNumCtxEnabled(params: {
  config?: GreenchClawConfig;
  providerId?: string;
}): boolean {
  return resolveConfiguredOllamaProviderConfig(params)?.injectNumCtxForOpenAICompat ?? true;
}

export function shouldInjectOllamaCompatNumCtx(params: {
  model: { api?: string; provider?: string; baseUrl?: string };
  config?: GreenchClawConfig;
  providerId?: string;
}): boolean {
  if (params.model.api !== "openai-completions") {
    return false;
  }
  if (!isOllamaCompatProvider(params.model)) {
    return false;
  }
  return resolveOllamaCompatNumCtxEnabled({
    config: params.config,
    providerId: params.providerId,
  });
}

export function wrapOllamaCompatNumCtx(baseFn: StreamFn | undefined, numCtx: number): StreamFn {
  const streamFn = baseFn ?? streamSimple;
  return (model, context, options) =>
    streamWithPayloadPatch(streamFn, model, context, options, (payloadRecord) => {
      if (!payloadRecord.options || typeof payloadRecord.options !== "object") {
        payloadRecord.options = {};
      }
      (payloadRecord.options as Record<string, unknown>).num_ctx = numCtx;
      normalizeOllamaCompatMessageToolArgs(payloadRecord);
    });
}

type OllamaThinkValue = boolean | "low" | "medium" | "high";

const OLLAMA_OPTION_PARAM_KEYS = new Set([
  "num_keep",
  "seed",
  "num_predict",
  "top_k",
  "top_p",
  "min_p",
  "typical_p",
  "repeat_last_n",
  "temperature",
  "repeat_penalty",
  "presence_penalty",
  "frequency_penalty",
  "stop",
  "num_ctx",
  "num_batch",
  "num_gpu",
  "main_gpu",
  "use_mmap",
  "num_thread",
]);

const OLLAMA_TOP_LEVEL_PARAM_KEYS = new Set(["format", "keep_alive", "truncate", "shift"]);

function createOllamaThinkingWrapper(
  baseFn: StreamFn | undefined,
  think: OllamaThinkValue,
): StreamFn {
  const streamFn = baseFn ?? streamSimple;
  return (model, context, options) =>
    streamWithPayloadPatch(streamFn, model, context, options, (payloadRecord) => {
      payloadRecord.think = think;
    });
}

function resolveOllamaThinkValue(thinkingLevel: unknown): OllamaThinkValue | undefined {
  if (thinkingLevel === "off") {
    return false;
  }
  if (thinkingLevel === "low" || thinkingLevel === "medium" || thinkingLevel === "high") {
    return thinkingLevel;
  }
  if (thinkingLevel === "minimal") {
    return "low";
  }
  if (thinkingLevel === "xhigh" || thinkingLevel === "adaptive" || thinkingLevel === "max") {
    return "high";
  }
  return undefined;
}

function resolveOllamaThinkParamValue(
  params: Record<string, unknown> | undefined,
): OllamaThinkValue | undefined {
  const raw = params?.think ?? params?.thinking;
  if (typeof raw === "boolean") {
    return raw;
  }
  if (raw === "off") {
    return false;
  }
  if (raw === "low" || raw === "medium" || raw === "high") {
    return raw;
  }
  if (raw === "minimal") {
    return "low";
  }
  if (raw === "xhigh" || raw === "adaptive" || raw === "max") {
    return "high";
  }
  return undefined;
}

function resolveOllamaConfiguredNumCtx(model: ProviderRuntimeModel): number | undefined {
  const raw = model.params?.num_ctx;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.floor(raw);
}

function resolveOllamaNumCtx(model: ProviderRuntimeModel): number {
  return (
    resolveOllamaConfiguredNumCtx(model) ??
    Math.max(1, Math.floor(model.contextWindow ?? model.maxTokens ?? DEFAULT_CONTEXT_TOKENS))
  );
}

/**
 * Sane num_ctx floor used when a local Ollama request would otherwise run at
 * the server default (4096). 4096 silently truncates real sessions — large
 * prompts overflow the KV window and produce garbage — so requests against
 * local servers never resolve below this unless the operator explicitly
 * configures a smaller `params.num_ctx`.
 */
const OLLAMA_FALLBACK_NUM_CTX = 8192;

function isLocalOllamaRequestBaseUrl(requestBaseUrl: string): boolean {
  try {
    const parsed = new URL(requestBaseUrl);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      hostname = hostname.slice(1, -1);
    }
    if (hostname === "localhost" || hostname === "::1") {
      return true;
    }
    const octets = hostname.split(".");
    if (octets.length === 4 && octets.every((o) => /^\d{1,3}$/.test(o))) {
      const ip = octets.map((o) => Number(o));
      if (ip.some((n) => n > 255)) {
        return false;
      }
      const [a, b] = ip as [number, number, number, number];
      // RFC1918 private + link-local + loopback + CGNAT (100.64.0.0/10).
      return (
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        (a === 100 && b >= 64 && b <= 127)
      );
    }
    // IPv6 unique-local (fc00::/7) + link-local (fe80::/10).
    if (/^f[cd][0-9a-f]{2}(?::|$)/.test(hostname) || /^fe[89ab][0-9a-f]?(?::|$)/.test(hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolves num_ctx for native /api/chat requests, in precedence order:
 *  1. explicit config wins — `params.num_ctx` merged onto the model from
 *     model-level then provider-level `models.providers.*.params`
 *     (`readModelParams` merge chain in pi-embedded-runner/model.ts),
 *  2. for LOCAL servers (loopback/LAN), fall back to model metadata
 *     (`contextWindow`) so requests stop running at Ollama's silent 4096
 *     default while the model supports far more — large sessions otherwise
 *     overflow the KV window and produce garbage. Cloud/remote requests keep
 *     server-side policy (explicit-only) so upstream limits are respected.
 *  3. sane floor for local servers when metadata is unusable.
 *
 * This intentionally differs from `resolveOllamaNumCtx` (the OpenAI-compat
 * wrapper path) by reading real model metadata instead of guessing.
 */
function resolveOllamaNativeNumCtx(
  model: ProviderRuntimeModel,
  requestBaseUrl?: string,
): number | undefined {
  const configured = resolveOllamaConfiguredNumCtx(model);
  if (configured !== undefined) {
    return configured;
  }
  if (!requestBaseUrl || !isLocalOllamaRequestBaseUrl(requestBaseUrl)) {
    return undefined;
  }
  const metadataContextWindow = model.contextWindow;
  if (
    typeof metadataContextWindow === "number" &&
    Number.isFinite(metadataContextWindow) &&
    metadataContextWindow > 0
  ) {
    return Math.floor(metadataContextWindow);
  }
  return OLLAMA_FALLBACK_NUM_CTX;
}

function resolveOllamaModelOptions(
  model: ProviderRuntimeModel,
  requestBaseUrl?: string,
): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  const params = model.params;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    for (const [key, value] of Object.entries(params)) {
      if (key === "num_ctx") {
        continue;
      }
      if (value !== undefined && OLLAMA_OPTION_PARAM_KEYS.has(key)) {
        options[key] = value;
      }
    }
  }
  const numCtx = resolveOllamaNativeNumCtx(model, requestBaseUrl);
  if (numCtx !== undefined) {
    options.num_ctx = numCtx;
  }
  return options;
}

function resolveOllamaTopLevelParams(
  model: ProviderRuntimeModel,
): Record<string, unknown> | undefined {
  const requestParams: Record<string, unknown> = {};
  const params = model.params;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && OLLAMA_TOP_LEVEL_PARAM_KEYS.has(key)) {
        requestParams[key] = value;
      }
    }
  }
  const think = resolveOllamaThinkParamValue(params);
  if (think !== undefined) {
    requestParams.think = think;
  }
  return Object.keys(requestParams).length > 0 ? requestParams : undefined;
}

function isOllamaCloudKimiModelRef(modelId: string): boolean {
  const normalizedModelId = normalizeLowercaseStringOrEmpty(modelId);
  return normalizedModelId.startsWith("kimi-k") && normalizedModelId.includes(":cloud");
}

export function createConfiguredOllamaCompatStreamWrapper(
  ctx: ProviderWrapStreamFnContext,
): StreamFn | undefined {
  let streamFn = ctx.streamFn;
  const model = ctx.model;
  let injectNumCtx = false;
  const isNativeOllamaTransport = model?.api === "ollama";

  if (model) {
    const providerId =
      typeof model.provider === "string" && model.provider.trim().length > 0
        ? model.provider
        : ctx.provider;
    if (
      shouldInjectOllamaCompatNumCtx({
        model,
        config: ctx.config,
        providerId,
      })
    ) {
      injectNumCtx = true;
    }
  }

  if (injectNumCtx && model) {
    streamFn = wrapOllamaCompatNumCtx(streamFn, resolveOllamaNumCtx(model));
  }

  const configuredThinkValue = model ? resolveOllamaThinkParamValue(model.params) : undefined;
  const runtimeThinkValue = isNativeOllamaTransport
    ? resolveOllamaThinkValue(ctx.thinkingLevel)
    : undefined;
  // "off" is also the implicit agent default. Preserve explicit native Ollama
  // model config unless the active run requests a non-off thinking level.
  const ollamaThinkValue =
    runtimeThinkValue === false && configuredThinkValue !== undefined
      ? undefined
      : runtimeThinkValue;
  if (ollamaThinkValue !== undefined) {
    streamFn = createOllamaThinkingWrapper(streamFn, ollamaThinkValue);
  }

  if (normalizeProviderId(ctx.provider) === "ollama" && isOllamaCloudKimiModelRef(ctx.modelId)) {
    const thinkingType = resolveMoonshotThinkingType({
      configuredThinking: ctx.extraParams?.thinking,
      thinkingLevel: ctx.thinkingLevel,
    });
    streamFn = createMoonshotThinkingWrapper(streamFn, thinkingType);
  }

  return streamFn;
}

/** @deprecated Use createConfiguredOllamaCompatStreamWrapper. */
export const createConfiguredOllamaCompatNumCtxWrapper = createConfiguredOllamaCompatStreamWrapper;

export function buildOllamaChatRequest(params: {
  modelId: string;
  providerId?: string;
  messages: OllamaChatMessage[];
  tools?: OllamaTool[];
  options?: Record<string, unknown>;
  requestParams?: Record<string, unknown>;
  stream?: boolean;
}): OllamaChatRequest {
  return {
    model: normalizeOllamaWireModelId(params.modelId, params.providerId),
    messages: params.messages,
    stream: params.stream ?? true,
    ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
    ...(params.options ? { options: params.options } : {}),
    ...params.requestParams,
  };
}

type StreamModelDescriptor = {
  api: string;
  provider: string;
  id: string;
};

type OllamaUsageFallback = {
  input?: number;
  output?: number;
};

const CHARS_PER_TOKEN_ESTIMATE = 4;

function buildUsageWithNoCost(params: {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}): Usage {
  const input = params.input ?? 0;
  const output = params.output ?? 0;
  const cacheRead = params.cacheRead ?? 0;
  const cacheWrite = params.cacheWrite ?? 0;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: params.totalTokens ?? input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function buildStreamAssistantMessage(params: {
  model: StreamModelDescriptor;
  content: AssistantMessage["content"];
  stopReason: StopReason;
  usage: Usage;
  timestamp?: number;
}): AssistantMessage {
  return {
    role: "assistant",
    content: params.content,
    stopReason: params.stopReason,
    api: params.model.api,
    provider: params.model.provider,
    model: params.model.id,
    usage: params.usage,
    timestamp: params.timestamp ?? Date.now(),
  };
}

function buildStreamErrorAssistantMessage(params: {
  model: StreamModelDescriptor;
  errorMessage: string;
  timestamp?: number;
}): AssistantMessage & { stopReason: "error"; errorMessage: string } {
  return {
    ...buildStreamAssistantMessage({
      model: params.model,
      content: [],
      stopReason: "error",
      usage: buildUsageWithNoCost({}),
      timestamp: params.timestamp,
    }),
    stopReason: "error",
    errorMessage: params.errorMessage,
  };
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  tools?: OllamaTool[];
  options?: Record<string, unknown>;
  think?: OllamaThinkValue;
}

interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: "assistant";
    content: string;
    thinking?: string;
    reasoning?: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

function safeJsonLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized.length : 0;
  } catch {
    return 0;
  }
}

function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(chars / CHARS_PER_TOKEN_ESTIMATE));
}

function estimateOllamaPromptTokens(params: {
  messages: OllamaChatMessage[];
  tools: OllamaTool[];
}): number {
  let chars = 0;
  for (const message of params.messages) {
    chars += message.content.length;
    chars += safeJsonLength(message.images);
    chars += safeJsonLength(message.tool_calls);
    chars += message.tool_name?.length ?? 0;
  }
  chars += safeJsonLength(params.tools);
  return estimateTokensFromChars(chars);
}

function estimateOllamaCompletionTokens(response: OllamaChatResponse): number {
  const chars =
    response.message.content.length +
    (response.message.thinking?.length ?? 0) +
    (response.message.reasoning?.length ?? 0) +
    safeJsonLength(response.message.tool_calls);
  return estimateTokensFromChars(chars);
}

function resolveUsageCount(value: number | undefined, fallback: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  return 0;
}

type InputContentPart =
  | { type: "text"; text: string }
  | { type: "image"; data: string }
  | { type: "toolCall"; id: string; name: string; arguments: unknown }
  | { type: "tool_use"; id: string; name: string; input: unknown };

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return (content as InputContentPart[])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function extractOllamaImages(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return (content as InputContentPart[])
    .filter((part): part is { type: "image"; data: string } => part.type === "image")
    .map((part) => part.data);
}

function ensureArgsObject(value: unknown): Record<string, unknown> {
  return parseJsonObjectPreservingUnsafeIntegers(value) ?? {};
}

function normalizeOllamaToolCallArguments(value: unknown): Record<string, unknown> {
  return ensureArgsObject(value);
}

function normalizeOllamaCompatMessageToolArgs(payloadRecord: Record<string, unknown>): void {
  const messages = payloadRecord.messages;
  if (!Array.isArray(messages)) {
    return;
  }

  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      continue;
    }
    const messageRecord = message as Record<string, unknown>;

    const functionCall = messageRecord.function_call;
    if (functionCall && typeof functionCall === "object" && !Array.isArray(functionCall)) {
      const functionCallRecord = functionCall as Record<string, unknown>;
      if (Object.hasOwn(functionCallRecord, "arguments")) {
        functionCallRecord.arguments = ensureArgsObject(functionCallRecord.arguments);
      }
    }

    const toolCalls = messageRecord.tool_calls;
    if (!Array.isArray(toolCalls)) {
      continue;
    }
    for (const toolCall of toolCalls) {
      if (!toolCall || typeof toolCall !== "object" || Array.isArray(toolCall)) {
        continue;
      }
      const functionSpec = (toolCall as Record<string, unknown>).function;
      if (!functionSpec || typeof functionSpec !== "object" || Array.isArray(functionSpec)) {
        continue;
      }
      const functionRecord = functionSpec as Record<string, unknown>;
      if (Object.hasOwn(functionRecord, "arguments")) {
        functionRecord.arguments = ensureArgsObject(functionRecord.arguments);
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function inferOllamaSchemaType(schema: Record<string, unknown>): string | undefined {
  if (schema.properties && isRecord(schema.properties)) {
    return "object";
  }
  if (schema.items) {
    return "array";
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum.filter((value) => value !== null);
    if (values.length > 0 && values.every((value) => typeof value === "string")) {
      return "string";
    }
    if (values.length > 0 && values.every((value) => typeof value === "number")) {
      return "number";
    }
    if (values.length > 0 && values.every((value) => typeof value === "boolean")) {
      return "boolean";
    }
  }
  for (const unionKey of ["anyOf", "oneOf"] as const) {
    const variants = schema[unionKey];
    if (!Array.isArray(variants)) {
      continue;
    }
    for (const variant of variants) {
      if (!isRecord(variant)) {
        continue;
      }
      const variantType = variant.type;
      if (typeof variantType === "string" && variantType !== "null") {
        return variantType;
      }
      if (Array.isArray(variantType)) {
        const firstType = variantType.find(
          (entry): entry is string => typeof entry === "string" && entry !== "null",
        );
        if (firstType) {
          return firstType;
        }
      }
      const inferred = inferOllamaSchemaType(variant);
      if (inferred) {
        return inferred;
      }
    }
  }
  return undefined;
}

function normalizeOllamaToolSchema(schema: unknown, isRoot = false): Record<string, unknown> {
  if (!isRecord(schema)) {
    return {
      type: "object",
      properties: {},
    };
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "properties" && isRecord(value)) {
      normalized.properties = Object.fromEntries(
        Object.entries(value).map(([propertyName, propertySchema]) => [
          propertyName,
          normalizeOllamaToolSchema(propertySchema),
        ]),
      );
      continue;
    }
    if (key === "items") {
      normalized.items = Array.isArray(value)
        ? value.map((entry) => normalizeOllamaToolSchema(entry))
        : normalizeOllamaToolSchema(value);
      continue;
    }
    if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      normalized[key] = value.map((entry) => normalizeOllamaToolSchema(entry));
      continue;
    }
    normalized[key] = value;
  }

  const schemaType = normalized.type;
  if (
    typeof schemaType !== "string" &&
    (!Array.isArray(schemaType) ||
      !schemaType.some((entry) => typeof entry === "string" && entry !== "null"))
  ) {
    normalized.type = inferOllamaSchemaType(normalized) ?? (isRoot ? "object" : "string");
  }
  if (normalized.type === "object" && !isRecord(normalized.properties)) {
    normalized.properties = {};
  }
  return normalized;
}

type OllamaToolCallNameOptions = {
  availableToolNames?: ReadonlySet<string>;
};

function extractToolCalls(
  content: unknown,
  options: OllamaToolCallNameOptions = {},
): OllamaToolCall[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const parts = content as InputContentPart[];
  const result: OllamaToolCall[] = [];
  for (const part of parts) {
    if (part.type === "toolCall") {
      result.push({
        function: {
          name: normalizeOllamaToolCallName(part.name, options),
          arguments: ensureArgsObject(part.arguments),
        },
      });
    } else if (part.type === "tool_use") {
      result.push({
        function: {
          name: normalizeOllamaToolCallName(part.name, options),
          arguments: ensureArgsObject(part.input),
        },
      });
    }
  }
  return result;
}

function buildOllamaToolNameSet(tools: Tool[] | undefined): ReadonlySet<string> | undefined {
  if (!tools || !Array.isArray(tools)) {
    return undefined;
  }
  const names = new Set<string>();
  for (const tool of tools) {
    if (typeof tool.name === "string" && tool.name.trim()) {
      names.add(tool.name.trim());
    }
  }
  return names.size > 0 ? names : undefined;
}

function normalizeOllamaToolCallName(
  rawName: string,
  options: OllamaToolCallNameOptions = {},
): string {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return trimmed;
  }
  const availableToolNames = options.availableToolNames;
  if (availableToolNames?.has(trimmed)) {
    return trimmed;
  }

  const strippedAnySeparator = trimmed.replace(/^(?:functions?|tools?)[./_-]+/iu, "").trim();
  if (
    availableToolNames &&
    strippedAnySeparator !== trimmed &&
    availableToolNames.has(strippedAnySeparator)
  ) {
    return strippedAnySeparator;
  }
  if (availableToolNames) {
    return trimmed;
  }

  return trimmed.replace(/^(?:functions?|tools?)[./]+/iu, "").trim();
}

export function convertToOllamaMessages(
  messages: Array<{ role: string; content: unknown }>,
  system?: string,
  options: OllamaToolCallNameOptions = {},
): OllamaChatMessage[] {
  const result: OllamaChatMessage[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = extractTextContent(msg.content);
      const images = extractOllamaImages(msg.content);
      result.push({
        role: "user",
        content: text,
        ...(images.length > 0 ? { images } : {}),
      });
      continue;
    }

    if (msg.role === "assistant") {
      const text = extractTextContent(msg.content);
      const toolCalls = extractToolCalls(msg.content, options);
      result.push({
        role: "assistant",
        content: text,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    if (msg.role === "tool" || msg.role === "toolResult") {
      const text = extractTextContent(msg.content);
      const toolName =
        typeof (msg as { toolName?: unknown }).toolName === "string"
          ? (msg as { toolName?: string }).toolName
          : undefined;
      result.push({
        role: "tool",
        content: text,
        ...(toolName ? { tool_name: toolName } : {}),
      });
    }
  }

  return result;
}

function extractOllamaTools(tools: Tool[] | undefined): OllamaTool[] {
  if (!tools || !Array.isArray(tools)) {
    return [];
  }
  const result: OllamaTool[] = [];
  for (const tool of tools) {
    if (typeof tool.name !== "string" || !tool.name) {
      continue;
    }
    result.push({
      type: "function",
      function: {
        name: tool.name,
        description: typeof tool.description === "string" ? tool.description : "",
        parameters: normalizeOllamaToolSchema(tool.parameters, true),
      },
    });
  }
  return result;
}

export function buildAssistantMessage(
  response: OllamaChatResponse,
  modelInfo: StreamModelDescriptor,
  usageFallback?: OllamaUsageFallback,
  options: OllamaToolCallNameOptions = {},
): AssistantMessage {
  const content: (TextContent | ThinkingContent | ToolCall)[] = [];
  const thinking = response.message.thinking ?? response.message.reasoning ?? "";
  if (thinking) {
    content.push({ type: "thinking", thinking });
  }
  const text = response.message.content || "";
  if (text) {
    content.push({ type: "text", text });
  }

  const toolCalls = response.message.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    for (const toolCall of toolCalls) {
      content.push({
        type: "toolCall",
        id: `ollama_call_${randomUUID()}`,
        name: normalizeOllamaToolCallName(toolCall.function.name, options),
        arguments: normalizeOllamaToolCallArguments(toolCall.function.arguments),
      });
    }
  }

  return buildStreamAssistantMessage({
    model: modelInfo,
    content,
    stopReason: toolCalls && toolCalls.length > 0 ? "toolUse" : "stop",
    usage: buildUsageWithNoCost({
      input: resolveUsageCount(response.prompt_eval_count, usageFallback?.input),
      output: resolveUsageCount(response.eval_count, usageFallback?.output),
    }),
  });
}

export async function* parseNdjsonStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<OllamaChatResponse> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        yield parseJsonPreservingUnsafeIntegers(trimmed) as OllamaChatResponse;
      } catch {
        log.warn(`Skipping malformed NDJSON line: ${trimmed.slice(0, 120)}`);
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield parseJsonPreservingUnsafeIntegers(buffer.trim()) as OllamaChatResponse;
    } catch {
      log.warn(`Skipping malformed trailing data: ${buffer.trim().slice(0, 120)}`);
    }
  }
}

function resolveOllamaChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const normalizedBase = trimmed.replace(/\/v1$/i, "");
  return `${normalizedBase || OLLAMA_NATIVE_BASE_URL}/api/chat`;
}

function resolveOllamaModelHeaders(model: {
  headers?: unknown;
}): Record<string, string> | undefined {
  if (!model.headers || typeof model.headers !== "object" || Array.isArray(model.headers)) {
    return undefined;
  }
  return model.headers as Record<string, string>;
}

function resolveOllamaRequestTimeoutMs(
  model: object,
  options: { requestTimeoutMs?: unknown; timeoutMs?: unknown } | undefined,
): number | undefined {
  const raw =
    options?.requestTimeoutMs ??
    options?.timeoutMs ??
    (model as { requestTimeoutMs?: unknown }).requestTimeoutMs;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : undefined;
}

/**
 * Endpoint routing for the shared pi-ai api registry.
 *
 * pi-ai registers ONE stream per api id (e.g. "ollama"), first registration
 * wins (`ensureCustomApiRegistered`), and every provider configured with that
 * api dispatches through the same entry — including summarizer requests that
 * bypass `session.agent.streamFn` (pi `compact()` → `completeSimple`).
 * A stream fn created for provider A must therefore not serve provider B's
 * models against A's baked URL: when the request model belongs to a different
 * provider, route by the model's own baseUrl — the same per-model dispatch the
 * normal chat path already uses. Without this, a stream baked for the cloud
 * "ollama" provider (https://ollama.com) sends `ollama-local/*` summarizer
 * requests to ollama.com (401) while the model's local baseUrl points at
 * 127.0.0.1.
 */
function resolveRequestOllamaEndpoint(params: {
  model: { provider?: unknown; baseUrl?: unknown };
  bakedChatUrl: string;
  bakedSsrfPolicy: ReturnType<typeof buildOllamaBaseUrlSsrFPolicy>;
  creationProvider?: string;
}): { chatUrl: string; ssrfPolicy: ReturnType<typeof buildOllamaBaseUrlSsrFPolicy> } {
  const creationProvider = params.creationProvider?.trim();
  const rawRequestProvider = params.model.provider;
  const requestProvider =
    typeof rawRequestProvider === "string" ? rawRequestProvider.trim() : "";
  if (!creationProvider || !requestProvider || creationProvider === requestProvider) {
    return { chatUrl: params.bakedChatUrl, ssrfPolicy: params.bakedSsrfPolicy };
  }
  const modelBaseUrl = readStringValue(params.model.baseUrl)?.trim() ?? "";
  if (!modelBaseUrl) {
    return { chatUrl: params.bakedChatUrl, ssrfPolicy: params.bakedSsrfPolicy };
  }
  const chatUrl = resolveOllamaChatUrl(modelBaseUrl);
  if (chatUrl === params.bakedChatUrl) {
    return { chatUrl: params.bakedChatUrl, ssrfPolicy: params.bakedSsrfPolicy };
  }
  return {
    chatUrl,
    ssrfPolicy: buildOllamaBaseUrlSsrFPolicy(chatUrl),
  };
}

export function createOllamaStreamFn(
  baseUrl: string,
  defaultHeaders?: Record<string, string>,
  routing?: { creationProvider?: string },
): StreamFn {
  const bakedChatUrl = resolveOllamaChatUrl(baseUrl);
  const bakedSsrfPolicy = buildOllamaBaseUrlSsrFPolicy(bakedChatUrl);

  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();

    const run = async () => {
      try {
        const { chatUrl, ssrfPolicy } = resolveRequestOllamaEndpoint({
          model,
          bakedChatUrl,
          bakedSsrfPolicy,
          creationProvider: routing?.creationProvider,
        });
        const availableToolNames = buildOllamaToolNameSet(context.tools);
        const toolCallNameOptions: OllamaToolCallNameOptions = availableToolNames
          ? { availableToolNames }
          : {};
        const ollamaMessages = convertToOllamaMessages(
          context.messages ?? [],
          context.systemPrompt,
          toolCallNameOptions,
        );
        const ollamaTools = extractOllamaTools(context.tools);

        const ollamaOptions: Record<string, unknown> = resolveOllamaModelOptions(
          model,
          chatUrl,
        );
        if (typeof options?.temperature === "number") {
          ollamaOptions.temperature = options.temperature;
        }
        if (typeof options?.maxTokens === "number") {
          ollamaOptions.num_predict = options.maxTokens;
        }

        const body = buildOllamaChatRequest({
          modelId: model.id,
          providerId: model.provider,
          messages: ollamaMessages,
          stream: true,
          tools: ollamaTools,
          options: ollamaOptions,
          requestParams: resolveOllamaTopLevelParams(model),
        });
        options?.onPayload?.(body, model);
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...defaultHeaders,
          ...options?.headers,
        };
        if (
          options?.apiKey &&
          (!headers.Authorization || !isNonSecretApiKeyMarker(options.apiKey))
        ) {
          headers.Authorization = `Bearer ${options.apiKey}`;
        }

        const { response, release } = await fetchWithSsrFGuard({
          url: chatUrl,
          init: {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          },
          policy: ssrfPolicy,
          ...(options?.signal ? { signal: options.signal } : {}),
          timeoutMs: resolveOllamaRequestTimeoutMs(
            model,
            options as { requestTimeoutMs?: unknown; timeoutMs?: unknown } | undefined,
          ),
          auditContext: "ollama-stream.chat",
        });

        try {
          if (!response.ok) {
            const errorText = await response.text().catch(() => "unknown error");
            throw new Error(`${response.status} ${errorText}`);
          }
          if (!response.body) {
            throw new Error("Ollama API returned empty response body");
          }

          const reader = response.body.getReader();
          let accumulatedContent = "";
          let accumulatedThinking = "";
          const accumulatedToolCalls: OllamaToolCall[] = [];
          let finalResponse: OllamaChatResponse | undefined;
          const modelInfo = { api: model.api, provider: model.provider, id: model.id };
          let streamStarted = false;
          let thinkingStarted = false;
          let thinkingEnded = false;
          let textBlockStarted = false;
          let textBlockClosed = false;
          const textContentIndex = () => (thinkingStarted ? 1 : 0);

          const buildCurrentContent = (): (TextContent | ThinkingContent | ToolCall)[] => {
            const parts: (TextContent | ThinkingContent | ToolCall)[] = [];
            if (accumulatedThinking) {
              parts.push({
                type: "thinking",
                thinking: accumulatedThinking,
              });
            }
            if (accumulatedContent) {
              parts.push({ type: "text", text: accumulatedContent });
            }
            return parts;
          };

          const closeThinkingBlock = () => {
            if (!thinkingStarted || thinkingEnded) {
              return;
            }
            thinkingEnded = true;
            const partial = buildStreamAssistantMessage({
              model: modelInfo,
              content: buildCurrentContent(),
              stopReason: "stop",
              usage: buildUsageWithNoCost({}),
            });
            stream.push({
              type: "thinking_end",
              contentIndex: 0,
              content: accumulatedThinking,
              partial,
            });
          };

          const closeTextBlock = () => {
            if (!textBlockStarted || textBlockClosed) {
              return;
            }
            textBlockClosed = true;
            const partial = buildStreamAssistantMessage({
              model: modelInfo,
              content: buildCurrentContent(),
              stopReason: "stop",
              usage: buildUsageWithNoCost({}),
            });
            stream.push({
              type: "text_end",
              contentIndex: textContentIndex(),
              content: accumulatedContent,
              partial,
            });
          };

          for await (const chunk of parseNdjsonStream(reader)) {
            const thinkingDelta = chunk.message?.thinking ?? chunk.message?.reasoning;
            if (thinkingDelta) {
              if (!streamStarted) {
                streamStarted = true;
                const emptyPartial = buildStreamAssistantMessage({
                  model: modelInfo,
                  content: [],
                  stopReason: "stop",
                  usage: buildUsageWithNoCost({}),
                });
                stream.push({ type: "start", partial: emptyPartial });
              }
              if (!thinkingStarted) {
                thinkingStarted = true;
                const partial = buildStreamAssistantMessage({
                  model: modelInfo,
                  content: buildCurrentContent(),
                  stopReason: "stop",
                  usage: buildUsageWithNoCost({}),
                });
                stream.push({ type: "thinking_start", contentIndex: 0, partial });
              }
              accumulatedThinking += thinkingDelta;
              const partial = buildStreamAssistantMessage({
                model: modelInfo,
                content: buildCurrentContent(),
                stopReason: "stop",
                usage: buildUsageWithNoCost({}),
              });
              stream.push({
                type: "thinking_delta",
                contentIndex: 0,
                delta: thinkingDelta,
                partial,
              });
            }

            if (chunk.message?.content) {
              const delta = chunk.message.content;
              if (thinkingStarted && !thinkingEnded) {
                closeThinkingBlock();
              }

              if (!streamStarted) {
                streamStarted = true;
                const emptyPartial = buildStreamAssistantMessage({
                  model: modelInfo,
                  content: [],
                  stopReason: "stop",
                  usage: buildUsageWithNoCost({}),
                });
                stream.push({ type: "start", partial: emptyPartial });
              }
              if (!textBlockStarted) {
                textBlockStarted = true;
                const partial = buildStreamAssistantMessage({
                  model: modelInfo,
                  content: buildCurrentContent(),
                  stopReason: "stop",
                  usage: buildUsageWithNoCost({}),
                });
                stream.push({ type: "text_start", contentIndex: textContentIndex(), partial });
              }

              accumulatedContent += delta;
              const partial = buildStreamAssistantMessage({
                model: modelInfo,
                content: buildCurrentContent(),
                stopReason: "stop",
                usage: buildUsageWithNoCost({}),
              });
              stream.push({
                type: "text_delta",
                contentIndex: textContentIndex(),
                delta,
                partial,
              });
            }
            if (chunk.message?.tool_calls) {
              closeThinkingBlock();
              closeTextBlock();
              accumulatedToolCalls.push(...chunk.message.tool_calls);
            }
            if (chunk.done) {
              finalResponse = chunk;
              break;
            }
          }

          if (!finalResponse) {
            throw new Error("Ollama API stream ended without a final response");
          }

          if (isLikelyGarbledVisibleText({ text: accumulatedContent, modelId: model.id })) {
            throw new Error(
              `Ollama returned non-linguistic garbled visible text for ${model.id}; retry or switch models`,
            );
          }

          finalResponse.message.content = accumulatedContent;
          if (accumulatedThinking) {
            finalResponse.message.thinking = accumulatedThinking;
          }
          if (accumulatedToolCalls.length > 0) {
            finalResponse.message.tool_calls = accumulatedToolCalls;
          }

          const usageFallback = {
            input: estimateOllamaPromptTokens({ messages: ollamaMessages, tools: ollamaTools }),
            output: estimateOllamaCompletionTokens(finalResponse),
          };
          const assistantMessage = buildAssistantMessage(
            finalResponse,
            modelInfo,
            usageFallback,
            toolCallNameOptions,
          );
          closeThinkingBlock();
          closeTextBlock();

          stream.push({
            type: "done",
            reason: assistantMessage.stopReason === "toolUse" ? "toolUse" : "stop",
            message: assistantMessage,
          });
        } finally {
          await release();
        }
      } catch (err) {
        stream.push({
          type: "error",
          reason: "error",
          error: buildStreamErrorAssistantMessage({
            model,
            errorMessage: formatErrorMessage(err),
          }),
        });
      } finally {
        stream.end();
      }
    };

    queueMicrotask(() => void run());
    return stream;
  };
}

export function createConfiguredOllamaStreamFn(params: {
  model: { provider?: string; baseUrl?: string; headers?: unknown };
  providerBaseUrl?: string;
  /**
   * Provider id this stream fn was created for. Marks the fn's "owning"
   * provider so the shared pi-ai api-registry entry can re-route requests for
   * OTHER providers by their own baseUrl (see resolveRequestOllamaEndpoint).
   */
  creationProvider?: string;
}): StreamFn {
  return createOllamaStreamFn(
    resolveOllamaBaseUrlForRun({
      modelBaseUrl: readStringValue(params.model.baseUrl),
      providerBaseUrl: params.providerBaseUrl,
    }),
    resolveOllamaModelHeaders(params.model),
    { creationProvider: params.creationProvider },
  );
}
