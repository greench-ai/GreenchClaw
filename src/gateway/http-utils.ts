import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { modelKey, parseModelRef, resolveDefaultModelForAgent } from "../agents/model-selection.js";
import { createModelVisibilityPolicy } from "../agents/model-visibility-policy.js";
import { getRuntimeConfig } from "../config/io.js";
import { buildAgentMainSessionKey, normalizeAgentId } from "../routing/session-key.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../shared/string-coerce.js";
import { normalizeMessageChannel } from "../utils/message-channel.js";
import { getHeader } from "./http-auth-utils.js";
import { loadGatewayModelCatalog } from "./server-model-catalog.js";

export {
  authorizeGatewayHttpRequestOrReply,
  authorizeScopedGatewayHttpRequestOrReply,
  checkGatewayHttpRequestAuth,
  getBearerToken,
  getHeader,
  isGatewayBearerHttpRequest,
  resolveHttpBrowserOriginPolicy,
  resolveHttpSenderIsOwner,
  resolveOpenAiCompatibleHttpOperatorScopes,
  resolveOpenAiCompatibleHttpSenderIsOwner,
  resolveTrustedHttpOperatorScopes,
  type AuthorizedGatewayHttpRequest,
  type GatewayHttpRequestAuthCheckResult,
} from "./http-auth-utils.js";

export const GREENCHCLAW_MODEL_ID = "GreenchClaw";
export const GREENCHCLAW_DEFAULT_MODEL_ID = "GreenchClaw/default";

const LOWERCASE_GATEWAY_MODEL_ID = GREENCHCLAW_MODEL_ID.toLowerCase();
const LOWERCASE_GATEWAY_DEFAULT_MODEL_ID = GREENCHCLAW_DEFAULT_MODEL_ID.toLowerCase();

function resolveAgentIdFromHeader(req: IncomingMessage): string | undefined {
  const raw =
    normalizeOptionalString(getHeader(req, "x-GreenchClaw-agent-id")) ||
    normalizeOptionalString(getHeader(req, "x-GreenchClaw-agent")) ||
    "";
  if (!raw) {
    return undefined;
  }
  return normalizeAgentId(raw);
}

export function resolveAgentIdFromModel(
  model: string | undefined,
  cfg = getRuntimeConfig(),
): string | undefined {
  const raw = model?.trim();
  if (!raw) {
    return undefined;
  }
  // Both the model ids and the inbound header values are matched
  // case-insensitively, so normalize the pattern the same way the ids are
  // compared (previously a title-case regex was tested against the raw value).
  const lowered = normalizeLowercaseStringOrEmpty(raw);
  if (lowered === LOWERCASE_GATEWAY_MODEL_ID || lowered === LOWERCASE_GATEWAY_DEFAULT_MODEL_ID) {
    return resolveDefaultAgentId(cfg);
  }

  const m =
    lowered.match(/^greenchclaw[:/](?<agentId>[a-z0-9][a-z0-9_-]{0,63})$/i) ??
    lowered.match(/^agent:(?<agentId>[a-z0-9][a-z0-9_-]{0,63})$/i);
  const agentId = m?.groups?.agentId;
  if (!agentId) {
    return undefined;
  }
  return normalizeAgentId(agentId);
}

export async function resolveOpenAiCompatModelOverride(params: {
  req: IncomingMessage;
  agentId: string;
  model: string | undefined;
}): Promise<{ modelOverride?: string; errorMessage?: string }> {
  const requestModel = params.model?.trim();
  const requestAgentId = requestModel ? resolveAgentIdFromModel(requestModel) : undefined;
  if (requestModel && !requestAgentId) {
    return {
      errorMessage: "Invalid `model`. Use `GreenchClaw` or `GreenchClaw/<agentId>`.",
    };
  }

  const raw = getHeader(params.req, "x-GreenchClaw-model")?.trim();
  if (!raw) {
    return {};
  }

  const cfg = getRuntimeConfig();
  // The request-level `model` field selects the agent first (`GreenchClaw/<agentId>`),
  // so the override must be validated against that agent's allowlist, not the
  // caller-supplied default.
  const agentId = requestAgentId ?? params.agentId;
  const defaultModelRef = resolveDefaultModelForAgent({ cfg, agentId });
  const defaultProvider = defaultModelRef.provider;
  const parsed = parseModelRef(raw, defaultProvider);
  if (!parsed) {
    return { errorMessage: "Invalid `x-GreenchClaw-model`." };
  }

  const catalog = await loadGatewayModelCatalog();
  const policy = createModelVisibilityPolicy({
    cfg,
    catalog,
    defaultProvider,
    agentId,
  });
  const normalized = modelKey(parsed.provider, parsed.model);
  if (!policy.allowsKey(normalized)) {
    return {
      errorMessage: `Model '${normalized}' is not allowed for agent '${agentId}'.`,
    };
  }

  return { modelOverride: raw };
}

export function resolveAgentIdForRequest(params: {
  req: IncomingMessage;
  model: string | undefined;
}): string {
  const cfg = getRuntimeConfig();
  const fromHeader = resolveAgentIdFromHeader(params.req);
  if (fromHeader) {
    return fromHeader;
  }

  const fromModel = resolveAgentIdFromModel(params.model, cfg);
  return fromModel ?? resolveDefaultAgentId(cfg);
}

function resolveSessionKey(params: {
  req: IncomingMessage;
  agentId: string;
  user?: string | undefined;
  prefix: string;
}): string {
  const explicit = getHeader(params.req, "x-GreenchClaw-session-key")?.trim();
  if (explicit) {
    return explicit;
  }

  const user = params.user?.trim();
  const mainKey = user ? `${params.prefix}-user:${user}` : `${params.prefix}:${randomUUID()}`;
  return buildAgentMainSessionKey({ agentId: params.agentId, mainKey });
}

export function resolveGatewayRequestContext(params: {
  req: IncomingMessage;
  model: string | undefined;
  user?: string | undefined;
  sessionPrefix: string;
  defaultMessageChannel: string;
  useMessageChannelHeader?: boolean;
}): { agentId: string; sessionKey: string; messageChannel: string } {
  const agentId = resolveAgentIdForRequest({ req: params.req, model: params.model });
  const sessionKey = resolveSessionKey({
    req: params.req,
    agentId,
    user: params.user,
    prefix: params.sessionPrefix,
  });

  const messageChannel = params.useMessageChannelHeader
    ? (normalizeMessageChannel(getHeader(params.req, "x-GreenchClaw-message-channel")) ??
      params.defaultMessageChannel)
    : params.defaultMessageChannel;

  return { agentId, sessionKey, messageChannel };
}
