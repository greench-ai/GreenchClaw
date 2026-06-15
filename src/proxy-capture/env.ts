import { randomUUID } from "node:crypto";
import type { Agent } from "node:http";
import { createRequire } from "node:module";
import process from "node:process";
import {
  resolveDebugProxyBlobDir,
  resolveDebugProxyCertDir,
  resolveDebugProxyDbPath,
} from "./paths.js";

export const GREENCHCLAW_DEBUG_PROXY_ENABLED = "GREENCHCLAW_DEBUG_PROXY_ENABLED";
export const GREENCHCLAW_DEBUG_PROXY_URL = "GREENCHCLAW_DEBUG_PROXY_URL";
export const GREENCHCLAW_DEBUG_PROXY_DB_PATH = "GREENCHCLAW_DEBUG_PROXY_DB_PATH";
export const GREENCHCLAW_DEBUG_PROXY_BLOB_DIR = "GREENCHCLAW_DEBUG_PROXY_BLOB_DIR";
export const GREENCHCLAW_DEBUG_PROXY_CERT_DIR = "GREENCHCLAW_DEBUG_PROXY_CERT_DIR";
export const GREENCHCLAW_DEBUG_PROXY_SESSION_ID = "GREENCHCLAW_DEBUG_PROXY_SESSION_ID";
export const GREENCHCLAW_DEBUG_PROXY_REQUIRE = "GREENCHCLAW_DEBUG_PROXY_REQUIRE";

export type DebugProxySettings = {
  enabled: boolean;
  required: boolean;
  proxyUrl?: string;
  dbPath: string;
  blobDir: string;
  certDir: string;
  sessionId: string;
  sourceProcess: string;
};

let cachedImplicitSessionId: string | undefined;
let cachedHttpsProxyAgent: typeof import("https-proxy-agent").HttpsProxyAgent | undefined;

function loadHttpsProxyAgent(): typeof import("https-proxy-agent").HttpsProxyAgent {
  cachedHttpsProxyAgent ??= (
    createRequire(import.meta.url)("https-proxy-agent") as typeof import("https-proxy-agent")
  ).HttpsProxyAgent;
  return cachedHttpsProxyAgent;
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function resolveDebugProxySettings(
  env: NodeJS.ProcessEnv = process.env,
): DebugProxySettings {
  const enabled = isTruthy(env[GREENCHCLAW_DEBUG_PROXY_ENABLED]);
  const explicitSessionId = env[GREENCHCLAW_DEBUG_PROXY_SESSION_ID]?.trim() || undefined;
  const sessionId = explicitSessionId ?? (cachedImplicitSessionId ??= randomUUID());
  return {
    enabled,
    required: isTruthy(env[GREENCHCLAW_DEBUG_PROXY_REQUIRE]),
    proxyUrl: env[GREENCHCLAW_DEBUG_PROXY_URL]?.trim() || undefined,
    dbPath: env[GREENCHCLAW_DEBUG_PROXY_DB_PATH]?.trim() || resolveDebugProxyDbPath(env),
    blobDir: env[GREENCHCLAW_DEBUG_PROXY_BLOB_DIR]?.trim() || resolveDebugProxyBlobDir(env),
    certDir: env[GREENCHCLAW_DEBUG_PROXY_CERT_DIR]?.trim() || resolveDebugProxyCertDir(env),
    sessionId,
    sourceProcess: "GreenchClaw",
  };
}

export function applyDebugProxyEnv(
  env: NodeJS.ProcessEnv,
  params: {
    proxyUrl: string;
    sessionId: string;
    dbPath?: string;
    blobDir?: string;
    certDir?: string;
  },
): NodeJS.ProcessEnv {
  return {
    ...env,
    [GREENCHCLAW_DEBUG_PROXY_ENABLED]: "1",
    [GREENCHCLAW_DEBUG_PROXY_REQUIRE]: "1",
    [GREENCHCLAW_DEBUG_PROXY_URL]: params.proxyUrl,
    [GREENCHCLAW_DEBUG_PROXY_DB_PATH]: params.dbPath ?? resolveDebugProxyDbPath(env),
    [GREENCHCLAW_DEBUG_PROXY_BLOB_DIR]: params.blobDir ?? resolveDebugProxyBlobDir(env),
    [GREENCHCLAW_DEBUG_PROXY_CERT_DIR]: params.certDir ?? resolveDebugProxyCertDir(env),
    [GREENCHCLAW_DEBUG_PROXY_SESSION_ID]: params.sessionId,
    HTTP_PROXY: params.proxyUrl,
    HTTPS_PROXY: params.proxyUrl,
    ALL_PROXY: params.proxyUrl,
  };
}

export function createDebugProxyWebSocketAgent(settings: DebugProxySettings): Agent | undefined {
  if (!settings.enabled || !settings.proxyUrl) {
    return undefined;
  }
  const HttpsProxyAgent = loadHttpsProxyAgent();
  return new HttpsProxyAgent(settings.proxyUrl);
}

export function resolveEffectiveDebugProxyUrl(configuredProxyUrl?: string): string | undefined {
  const explicit = configuredProxyUrl?.trim();
  if (explicit) {
    return explicit;
  }
  const settings = resolveDebugProxySettings();
  return settings.enabled ? settings.proxyUrl : undefined;
}
