import {
  clearApiProviders,
  completeSimple,
  registerApiProvider,
  registerBuiltInApiProviders,
} from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchWithSsrFGuardMock } = vi.hoisted(() => ({
  fetchWithSsrFGuardMock: vi.fn(),
}));

vi.mock("GreenchClaw/plugin-sdk/ssrf-runtime", () => ({
  fetchWithSsrFGuard: fetchWithSsrFGuardMock,
}));

import { createConfiguredOllamaStreamFn } from "./stream.js";

/**
 * Reproduces the compaction summarizer dispatch path end-to-end at the
 * pi-ai api-registry level: pi's session.compact() → generateSummary →
 * completeSimple(model) → getApiProvider(model.api).
 *
 * pi-ai keeps ONE provider per api id, and GreenchClaw registers the ollama
 * plugin stream under api "ollama" first-come-first-served — the primary
 * (cloud) provider usually wins. When a session carries a fallback-chain
 * model like ollama-local/lfm2.5-2.6b, its summarizer request dispatches
 * through that shared entry and MUST route by the request model's own
 * baseUrl, not the creation provider's baked URL (the observed 401-to-
 * ollama.com misroute while the model's baseUrl pointed at 127.0.0.1).
 */

const NDJSON_COMPLETION = [
  '{"model":"m","created_at":"t","message":{"role":"assistant","content":"summary text"},"done":false}',
  '{"model":"m","created_at":"t","message":{"role":"assistant","content":""},"done":true,"prompt_eval_count":1,"eval_count":1}',
].join("\n");

function mockNdjsonFetch() {
  fetchWithSsrFGuardMock.mockReset();
  fetchWithSsrFGuardMock.mockImplementation(async () => ({
    response: new Response(`${NDJSON_COMPLETION}\n`, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    }),
    release: vi.fn(async () => undefined),
  }));
}

function lastFetchRequestUrl(): string {
  const call = fetchWithSsrFGuardMock.mock.calls.at(0);
  if (!call) {
    throw new Error("expected a guarded fetch call");
  }
  return (call[0] as { url?: string })?.url ?? "";
}

const OLLAMA_LOCAL_MODEL = {
  id: "lfm2.5-2.6b",
  name: "lfm2.5-2.6b",
  api: "ollama",
  provider: "ollama-local",
  baseUrl: "http://127.0.0.1:11434",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 131072,
  maxTokens: 8192,
} as never;

const OLLAMA_CLOUD_MODEL = {
  id: "glm-5.3",
  name: "glm-5.3",
  api: "ollama",
  provider: "ollama",
  baseUrl: "https://ollama.com",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1048576,
  maxTokens: 8192,
} as never;

function registerSharedOllamaApi(streamFn: ReturnType<typeof createConfiguredOllamaStreamFn>) {
  // Mirror ensureCustomApiRegistered's shape: one entry serves both stream
  // entrypoints for the shared api id.
  registerApiProvider({
    api: "ollama",
    stream: streamFn as never,
    streamSimple: streamFn as never,
  });
}

afterEach(() => {
  clearApiProviders();
  registerBuiltInApiProviders();
  fetchWithSsrFGuardMock.mockReset();
});

describe("compaction summarizer dispatch through the shared api-registry entry", () => {
  it("routes ollama-local summarizer requests to the model's local baseUrl when the cloud provider registered first", async () => {
    mockNdjsonFetch();
    // The primary cloud model's session registered api "ollama" first — the
    // stream fn is baked for https://ollama.com.
    registerSharedOllamaApi(
      createConfiguredOllamaStreamFn({
        model: { provider: "ollama", baseUrl: "https://ollama.com" },
        providerBaseUrl: "https://ollama.com",
        creationProvider: "ollama",
      }),
    );

    // The summarizer request for a fallback-chain local model dispatches
    // through the shared entry (completeSimple is pi compact()'s path).
    const result = await completeSimple(OLLAMA_LOCAL_MODEL, {
      systemPrompt: "Summarize the conversation.",
      messages: [
        { role: "user", content: "summarize this", timestamp: Date.now() },
      ] as never,
    } as never, { maxTokens: 512, apiKey: "ollama-local", signal: undefined } as never);

    expect(lastFetchRequestUrl()).toBe("http://127.0.0.1:11434/api/chat");
    expect(
      result.content.some((block: { type: string; text?: string }) => block.type === "text"),
    ).toBe(true);
  });

  it("routes cloud summarizer requests to ollama.com when a local provider registered the shared entry first", async () => {
    mockNdjsonFetch();
    registerSharedOllamaApi(
      createConfiguredOllamaStreamFn({
        model: { provider: "ollama-local", baseUrl: "http://127.0.0.1:11434" },
        providerBaseUrl: "http://127.0.0.1:11434",
        creationProvider: "ollama-local",
      }),
    );

    await completeSimple(OLLAMA_CLOUD_MODEL, {
      systemPrompt: "Summarize the conversation.",
      messages: [
        { role: "user", content: "summarize this", timestamp: Date.now() },
      ] as never,
    } as never, { maxTokens: 512, apiKey: "real-cloud-key" } as never);

    expect(lastFetchRequestUrl()).toBe("https://ollama.com/api/chat");
  });
});