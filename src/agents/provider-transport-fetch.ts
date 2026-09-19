import type { Api, Model } from "@earendil-works/pi-ai";
import {
  fetchWithSsrFGuard,
  withTrustedEnvProxyGuardedFetchMode,
} from "../infra/net/fetch-guard.js";
import { shouldUseEnvHttpProxyForUrl } from "../infra/net/proxy-env.js";
import {
  ssrfPolicyFromHttpBaseUrlFakeIpHostnameAllowlist,
  type SsrFPolicy,
} from "../infra/net/ssrf.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveDebugProxySettings } from "../proxy-capture/env.js";
import { emitModelTransportDebug } from "./model-transport-debug.js";
import { formatModelTransportDebugUrl } from "./model-transport-url.js";
import {
  ensureModelProviderLocalService,
  type ProviderLocalServiceLease,
} from "./provider-local-service.js";
import {
  buildProviderRequestDispatcherPolicy,
  getModelProviderRequestTransport,
  mergeModelProviderRequestOverrides,
  resolveProviderRequestPolicyConfig,
} from "./provider-request-config.js";

const DEFAULT_MAX_SDK_RETRY_WAIT_SECONDS = 60;
const log = createSubsystemLogger("provider-transport-fetch");

/**
 * Pre-flight payload guard (2026-09-18, item-17 / Gohan's diagnosis):
 * subagent turns were inlining huge media (a 43MB wav → 100–150MB JSON
 * bodies) and the transport kept uploading until the 120s idle watchdog
 * killed the socket mid-upload, then the SDK retried on the same dead
 * socket — turning a bad payload into a stall. Fail fast instead: requests
 * larger than this limit are rejected before the upload starts, with an
 * error naming the oversized attachment. Override with
 * GREENCHCLAW_MAX_MODEL_REQUEST_BODY_MB (0 disables the guard).
 */
const DEFAULT_MAX_MODEL_REQUEST_BODY_BYTES = 10 * 1024 * 1024;
const MODEL_REQUEST_BODY_GUARD_DISABLED = Symbol.for(
  "GreenchClaw.modelRequestBodyGuard.disabledForTest",
);

function resolveMaxModelRequestBodyBytes(): number {
  if ((globalThis as Record<symbol, unknown>)[MODEL_REQUEST_BODY_GUARD_DISABLED] === true) {
    return Number.POSITIVE_INFINITY;
  }
  const raw = process.env.GREENCHCLAW_MAX_MODEL_REQUEST_BODY_MB?.trim();
  if (!raw) {
    return DEFAULT_MAX_MODEL_REQUEST_BODY_BYTES;
  }
  const mb = Number.parseFloat(raw);
  if (!Number.isFinite(mb)) {
    return DEFAULT_MAX_MODEL_REQUEST_BODY_BYTES;
  }
  if (mb <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(mb * 1024 * 1024);
}

/** Best-effort pointer at the oversized attachment inside a JSON body. */
function describeLargestBodyField(bodyText: string): string {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    let largest: { keyPath: string; bytes: number } | undefined;
    const walk = (value: unknown, keyPath: string): void => {
      if (typeof value === "string") {
        const bytes = Buffer.byteLength(value, "utf8");
        if (!largest || bytes > largest.bytes) {
          largest = { keyPath, bytes };
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, idx) => walk(entry, `${keyPath}[${idx}]`));
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
          walk(entry, keyPath ? `${keyPath}.${key}` : key);
        }
      }
    };
    walk(parsed, "");
    if (!largest) {
      return "";
    }
    return ` — largest field ${largest.keyPath} (~${Math.round(
      largest.bytes / 1024,
    )}KB) is the likely oversized attachment`;
  } catch {
    return "";
  }
}

/**
 * item-17b (ocr finding #4): the payload guard only measured string bodies, so
 * multipart uploads (FormData — the OpenAI SDK transcription/file path),
 * Blobs, and URLSearchParams bodies silently skipped BOTH the size guard and
 * the upload-aware idle timeout. FormData and Blob bodies are measured
 * without consuming them (iterating FormData entries is non-destructive);
 * true streams (ReadableStream / Request with a streamed body) remain
 * unmeasurable and keep the old skip (logged as bodyBytes=unknown).
 */
function estimateRequestBodyBytes(body: unknown): number | undefined {
  if (typeof body === "string") {
    return Buffer.byteLength(body, "utf8");
  }
  if (typeof FormData === "function" && body instanceof FormData) {
    let total = 0;
    let parts = 0;
    for (const [, value] of body.entries()) {
      if (typeof value === "string") {
        total += Buffer.byteLength(value, "utf8");
      } else if (value && typeof (value as Blob).size === "number") {
        total += (value as Blob).size;
      }
      parts += 1;
    }
    // Multipart overhead: per-part boundary + headers, plus final boundary.
    return total + parts * 512 + 1024;
  }
  if (typeof Blob === "function" && body instanceof Blob) {
    return body.size;
  }
  if (body instanceof URLSearchParams) {
    return Buffer.byteLength(body.toString(), "utf8");
  }
  return undefined;
}

/** Best-effort pointer at the oversized attachment inside a multipart body. */
function describeLargestFormField(body: FormData): string {
  let largest: { name: string; bytes: number } | undefined;
  for (const [name, value] of body.entries()) {
    const bytes =
      typeof value === "string" ? Buffer.byteLength(value, "utf8") : (value as Blob).size;
    if (!largest || bytes > largest.bytes) {
      largest = { name, bytes };
    }
  }
  if (!largest) {
    return "";
  }
  return ` — largest field ${largest.name} (~${Math.round(largest.bytes / 1024)}KB) is the likely oversized attachment`;
}

/**
 * Upload-aware idle timeout (item-17): the guarded-fetch timeout only
 * refreshes on response bytes, so a slow upload looks identical to a silent
 * server. Scale the timeout by body size (floor 256KB/s) so an in-progress
 * upload cannot be killed mid-flight, while genuinely silent servers keep
 * the configured timeout for small bodies.
 */
const UPLOAD_FLOOR_BYTES_PER_SECOND = 256 * 1024;
// Bodies at or under one second of floor-rate upload time are negligible
// against any configured timeout — they keep the exact configured timeout.
const UPLOAD_ALLOWANCE_MIN_BYTES = UPLOAD_FLOOR_BYTES_PER_SECOND;

function resolveUploadAwareTimeoutMs(params: {
  requestTimeoutMs: number | undefined;
  bodyBytes: number | undefined;
}): number | undefined {
  const { requestTimeoutMs, bodyBytes } = params;
  if (requestTimeoutMs === undefined || bodyBytes === undefined) {
    return requestTimeoutMs;
  }
  if (bodyBytes <= UPLOAD_ALLOWANCE_MIN_BYTES) {
    return requestTimeoutMs;
  }
  const uploadExtraMs = Math.ceil(bodyBytes / UPLOAD_FLOOR_BYTES_PER_SECOND) * 1000;
  return requestTimeoutMs + uploadExtraMs;
}

function hasReadableSseData(block: string): boolean {
  const dataLines = block
    .split(/\r\n|\n|\r/)
    .filter((line) => line === "data" || line.startsWith("data:"))
    .map((line) => {
      if (line === "data") {
        return "";
      }
      const value = line.slice("data:".length);
      return value.startsWith(" ") ? value.slice(1) : value;
    });
  return dataLines.length > 0 && dataLines.join("\n").trim().length > 0;
}

function findSseEventBoundary(buffer: string): { index: number; length: number } | undefined {
  let best: { index: number; length: number } | undefined;
  for (const delimiter of ["\r\n\r\n", "\n\n", "\r\r"]) {
    const index = buffer.indexOf(delimiter);
    if (index === -1) {
      continue;
    }
    if (!best || index < best.index) {
      best = { index, length: delimiter.length };
    }
  }
  return best;
}

function sanitizeOpenAISdkSseResponse(
  response: Response,
  options?: { synthesizeJsonAsSse?: boolean },
): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body) {
    return response;
  }
  if (
    options?.synthesizeJsonAsSse === true &&
    (/\bapplication\/json\b/i.test(contentType) || /\+json\b/i.test(contentType))
  ) {
    const source = response.body;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let buffer = "";
    const sseBody = new ReadableStream<Uint8Array>({
      start() {
        reader = source.getReader();
      },
      async pull(controller) {
        try {
          const chunk = await reader?.read();
          if (!chunk || chunk.done) {
            buffer += decoder.decode();
            const data = buffer.trim();
            if (data) {
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          buffer += decoder.decode(chunk.value, { stream: true });
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        await reader?.cancel(reason);
      },
    });
    const headers = new Headers(response.headers);
    headers.set("content-type", "text/event-stream; charset=utf-8");
    return new Response(sseBody, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  if (!/\btext\/event-stream\b/i.test(contentType)) {
    return response;
  }

  const source = response.body;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let buffer = "";

  const enqueueSanitized = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    text: string,
  ) => {
    buffer += text;
    for (;;) {
      const boundary = findSseEventBoundary(buffer);
      if (!boundary) {
        return;
      }
      const block = buffer.slice(0, boundary.index);
      const separator = buffer.slice(boundary.index, boundary.index + boundary.length);
      buffer = buffer.slice(boundary.index + boundary.length);
      // OpenAI's SDK currently tries to JSON.parse event-only or blank-data SSE
      // messages. Drop those malformed keepalive-style blocks before it parses.
      if (hasReadableSseData(block)) {
        controller.enqueue(encoder.encode(`${block}${separator}`));
      }
    }
  };

  const sanitizedBody = new ReadableStream<Uint8Array>({
    start() {
      reader = source.getReader();
    },
    async pull(controller) {
      try {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) {
          const tail = decoder.decode();
          if (tail) {
            enqueueSanitized(controller, tail);
          }
          if (buffer && hasReadableSseData(buffer)) {
            controller.enqueue(encoder.encode(buffer));
          }
          buffer = "";
          controller.close();
          return;
        }
        enqueueSanitized(controller, decoder.decode(chunk.value, { stream: true }));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader?.cancel(reason);
    },
  });

  return new Response(sanitizedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function shouldSanitizeOpenAISdkSseResponse(model: Model<Api>): boolean {
  if (model.provider !== "openai") {
    return true;
  }
  try {
    return new URL(model.baseUrl).hostname.toLowerCase() !== "api.openai.com";
  } catch {
    return true;
  }
}

async function requestBodyHasStreamTrue(
  request: Request | undefined,
  init: RequestInit | undefined,
): Promise<boolean> {
  const method = request?.method ?? init?.method;
  if (method && method.toUpperCase() !== "POST") {
    return false;
  }
  const headers = request?.headers ?? new Headers(init?.headers);
  const contentType = headers.get("content-type") ?? "";
  if (contentType && !/\bapplication\/json\b/i.test(contentType)) {
    return false;
  }

  let text: string | undefined;
  if (typeof init?.body === "string") {
    text = init.body;
  }
  if (!text) {
    return false;
  }
  try {
    return (JSON.parse(text) as { stream?: unknown }).stream === true;
  } catch {
    return false;
  }
}

function parseRetryAfterSeconds(headers: Headers): number | undefined {
  const retryAfterMs = headers.get("retry-after-ms");
  if (retryAfterMs) {
    const milliseconds = Number.parseFloat(retryAfterMs);
    if (Number.isFinite(milliseconds) && milliseconds >= 0) {
      return milliseconds / 1000;
    }
  }

  const retryAfter = headers.get("retry-after");
  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number.parseFloat(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, (retryAt - Date.now()) / 1000);
}

function resolveMaxSdkRetryWaitSeconds(): number | undefined {
  const raw = process.env.GREENCHCLAW_SDK_RETRY_MAX_WAIT_SECONDS?.trim();
  if (!raw) {
    return DEFAULT_MAX_SDK_RETRY_WAIT_SECONDS;
  }

  if (/^(?:0|false|off|none|disabled)$/i.test(raw)) {
    return undefined;
  }

  const seconds = Number.parseFloat(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds;
  }

  return DEFAULT_MAX_SDK_RETRY_WAIT_SECONDS;
}

function shouldBypassLongSdkRetry(response: Response): boolean {
  const maxWaitSeconds = resolveMaxSdkRetryWaitSeconds();
  if (maxWaitSeconds === undefined) {
    return false;
  }

  const status = response.status;
  const stainlessRetryable = status === 408 || status === 409 || status === 429 || status >= 500;
  if (!stainlessRetryable) {
    return false;
  }

  const retryAfterSeconds = parseRetryAfterSeconds(response.headers);
  if (retryAfterSeconds !== undefined) {
    return retryAfterSeconds > maxWaitSeconds;
  }

  return status === 429;
}

function buildManagedResponse(
  response: Response,
  release: () => Promise<void>,
  refreshTimeout?: () => void,
  localServiceLease?: ProviderLocalServiceLease,
): Response {
  const finalizeLocalServiceLease = () => {
    localServiceLease?.release();
  };
  if (!response.body) {
    void release().finally(finalizeLocalServiceLease);
    return response;
  }
  const source = response.body;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let released = false;
  const finalize = async () => {
    if (released) {
      return;
    }
    released = true;
    try {
      await release().catch(() => undefined);
    } finally {
      finalizeLocalServiceLease();
    }
  };
  const wrappedBody = new ReadableStream<Uint8Array>({
    start() {
      reader = source.getReader();
    },
    async pull(controller) {
      try {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) {
          controller.close();
          await finalize();
          return;
        }
        refreshTimeout?.();
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
        await finalize();
      }
    },
    async cancel(reason) {
      try {
        await reader?.cancel(reason);
      } finally {
        await finalize();
      }
    },
  });
  return new Response(wrappedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function resolveModelRequestPolicy(model: Model<Api>) {
  const debugProxy = resolveDebugProxySettings();
  let explicitDebugProxyUrl: string | undefined;
  if (debugProxy.enabled && debugProxy.proxyUrl) {
    try {
      if (new URL(model.baseUrl).protocol === "https:") {
        explicitDebugProxyUrl = debugProxy.proxyUrl;
      }
    } catch {
      // Non-URL provider base URLs cannot use the debug proxy override safely.
    }
  }
  const request = mergeModelProviderRequestOverrides(getModelProviderRequestTransport(model), {
    proxy: explicitDebugProxyUrl
      ? {
          mode: "explicit-proxy",
          url: explicitDebugProxyUrl,
        }
      : undefined,
  });
  return resolveProviderRequestPolicyConfig({
    provider: model.provider,
    api: model.api,
    baseUrl: model.baseUrl,
    capability: "llm",
    transport: "stream",
    request,
  });
}

export function resolveModelRequestTimeoutMs(
  model: Model<Api>,
  timeoutMs: number | undefined,
): number | undefined {
  if (timeoutMs !== undefined) {
    return timeoutMs;
  }
  const modelTimeoutMs = (model as { requestTimeoutMs?: unknown }).requestTimeoutMs;
  return typeof modelTimeoutMs === "number" && Number.isFinite(modelTimeoutMs) && modelTimeoutMs > 0
    ? Math.floor(modelTimeoutMs)
    : undefined;
}

function resolveHttpHostname(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function resolveModelTransportSsrFPolicy(params: {
  model: Model<Api>;
  url: string;
  allowPrivateNetwork?: boolean;
}): SsrFPolicy | undefined {
  const baseUrl = (params.model as { baseUrl?: unknown }).baseUrl;
  const baseHostname = resolveHttpHostname(baseUrl);
  const requestHostname = resolveHttpHostname(params.url);
  const fakeIpPolicy =
    typeof baseUrl === "string" && baseHostname && requestHostname === baseHostname
      ? ssrfPolicyFromHttpBaseUrlFakeIpHostnameAllowlist(baseUrl)
      : undefined;

  if (fakeIpPolicy) {
    return {
      ...fakeIpPolicy,
      ...(params.allowPrivateNetwork ? { allowPrivateNetwork: true } : {}),
    };
  }

  return params.allowPrivateNetwork ? { allowPrivateNetwork: true } : undefined;
}

export function buildGuardedModelFetch(
  model: Model<Api>,
  timeoutMs?: number,
  options?: { sanitizeSse?: boolean },
): typeof fetch {
  const requestConfig = resolveModelRequestPolicy(model);
  const dispatcherPolicy = buildProviderRequestDispatcherPolicy(requestConfig);
  const requestTimeoutMs = resolveModelRequestTimeoutMs(model, timeoutMs);
  const summarizeError = (error: unknown): string => {
    if (!error || typeof error !== "object") {
      return `type=${typeof error}`;
    }
    const record = error as Record<string, unknown>;
    const cause =
      record.cause && typeof record.cause === "object"
        ? (record.cause as Record<string, unknown>)
        : undefined;
    const read = (value: unknown) => (typeof value === "string" ? value : typeof value);
    return [
      `name=${read(record.name)}`,
      `code=${read(record.code)}`,
      `causeName=${read(cause?.name)}`,
      `causeCode=${read(cause?.code)}`,
      `message=${error instanceof Error ? error.message : read(record.message)}`,
    ].join(" ");
  };
  return async (input, init) => {
    let localServiceLease: ProviderLocalServiceLease | undefined;
    const request = input instanceof Request ? new Request(input, init) : undefined;
    const url =
      request?.url ??
      (input instanceof URL
        ? input.toString()
        : typeof input === "string"
          ? input
          : (() => {
              throw new Error("Unsupported fetch input for transport-aware model request");
            })());
    const policy = resolveModelTransportSsrFPolicy({
      model,
      url,
      allowPrivateNetwork: requestConfig.allowPrivateNetwork,
    });
    const requestInit =
      request &&
      ({
        method: request.method,
        headers: request.headers,
        body: request.body ?? undefined,
        redirect: request.redirect,
        signal: request.signal,
        ...(request.body ? ({ duplex: "half" } as const) : {}),
      } satisfies RequestInit & { duplex?: "half" });
    const synthesizeJsonAsSse = await requestBodyHasStreamTrue(request, requestInit ?? init);
    // 2026-09-18 (item-17): pre-flight payload-size guard + upload-aware
    // timeout. String JSON bodies (the OpenAI-compat SDK path) are measured
    // before dispatch; Request objects with streamed bodies skip measurement
    // (the body cannot be re-read safely).
    const rawBody = (requestInit ?? init)?.body;
    const bodyText = typeof rawBody === "string" ? (rawBody as string) : undefined;
    const bodyBytes = estimateRequestBodyBytes(rawBody);
    const maxBodyBytes = resolveMaxModelRequestBodyBytes();
    if (bodyBytes !== undefined && bodyBytes > maxBodyBytes) {
      const hint =
        bodyText !== undefined
          ? describeLargestBodyField(bodyText)
          : typeof FormData === "function" && rawBody instanceof FormData
            ? describeLargestFormField(rawBody)
            : "";
      const message = `Model request payload too large: ${(
        bodyBytes /
        (1024 * 1024)
      ).toFixed(1)}MB exceeds the ${Math.round(maxBodyBytes / (1024 * 1024))}MB limit${hint}. Attach smaller media or reference files by path instead of inlining them.`;
      log.error(
        `[model-fetch-payload-guard] blocked oversized request provider=${model.provider} api=${model.api} model=${model.id} bodyBytes=${bodyBytes} limitBytes=${maxBodyBytes}${hint}`,
        {
          provider: model.provider,
          api: model.api,
          model: model.id,
          bodyBytes,
          limitBytes: maxBodyBytes,
        },
      );
      // item-17b (ocr finding #5): throwing here made the OpenAI SDK treat
      // the permanent oversized-payload rejection as a connection failure
      // and re-send the same body up to maxRetries times. A synthetic 413
      // response is non-retryable by the SDK's shouldRetry (413 is outside
      // the retryable status set; x-should-retry: false is explicit
      // belt-and-braces) — the guard now fails exactly once and surfaces as
      // an APIError carrying this message.
      return new Response(
        JSON.stringify({
          error: {
            message,
            type: "invalid_request_error",
            code: "payload_too_large",
          },
        }),
        {
          status: 413,
          statusText: "Payload Too Large",
          headers: {
            "content-type": "application/json",
            "x-should-retry": "false",
          },
        },
      );
    }
    const uploadAwareTimeoutMs = resolveUploadAwareTimeoutMs({
      requestTimeoutMs,
      bodyBytes,
    });
    const guardedFetchOptions = {
      url,
      init: requestInit ?? init,
      capture: {
        meta: {
          provider: model.provider,
          api: model.api,
          model: model.id,
        },
      },
      dispatcherPolicy,
      timeoutMs: uploadAwareTimeoutMs,
      // Provider transport intentionally keeps the secure default and never
      // replays unsafe request bodies across cross-origin redirects.
      allowCrossOriginUnsafeRedirectReplay: false,
      ...(policy ? { policy } : {}),
    };
    let result: Awaited<ReturnType<typeof fetchWithSsrFGuard>>;
    const fetchStartedAt = Date.now();
    const useEnvProxy = !dispatcherPolicy && shouldUseEnvHttpProxyForUrl(url);
    emitModelTransportDebug(
      log,
      `[model-fetch] start provider=${model.provider} api=${model.api} model=${model.id} ` +
        `method=${(requestInit ?? init)?.method ?? "GET"} url=${formatModelTransportDebugUrl(url)} timeoutMs=${uploadAwareTimeoutMs} ` +
        `bodyBytes=${bodyBytes ?? "unknown"} ` +
        `proxy=${dispatcherPolicy ? "configured" : useEnvProxy ? "env" : "none"} ` +
        `policy=${policy ? "custom" : "default"}`,
    );
    try {
      localServiceLease = await ensureModelProviderLocalService(
        model,
        (requestInit ?? init)?.headers,
        (requestInit ?? init)?.signal,
      );
      result = await fetchWithSsrFGuard(
        useEnvProxy
          ? withTrustedEnvProxyGuardedFetchMode(guardedFetchOptions)
          : guardedFetchOptions,
      );
    } catch (error) {
      log.warn(
        `[model-fetch] error provider=${model.provider} api=${model.api} model=${model.id} ` +
          `elapsedMs=${Date.now() - fetchStartedAt} ${summarizeError(error)}`,
      );
      localServiceLease?.release();
      throw error;
    }
    let response = result.response;
    emitModelTransportDebug(
      log,
      `[model-fetch] response provider=${model.provider} api=${model.api} model=${model.id} ` +
        `status=${response.status} elapsedMs=${Date.now() - fetchStartedAt} ` +
        `contentType=${response.headers.get("content-type") ?? ""}`,
    );
    if (shouldBypassLongSdkRetry(response)) {
      const headers = new Headers(response.headers);
      headers.set("x-should-retry", "false");
      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    response = buildManagedResponse(
      response,
      result.release,
      result.refreshTimeout,
      localServiceLease,
    );
    return options?.sanitizeSse === false || !shouldSanitizeOpenAISdkSseResponse(model)
      ? response
      : sanitizeOpenAISdkSseResponse(response, { synthesizeJsonAsSse });
  };
}
