import type { IncomingMessage } from "node:http";
import {
  getHeader,
  resolveTrustedHttpOperatorScopes,
  type AuthorizedGatewayHttpRequest,
} from "../http-auth-utils.js";
import { CLI_DEFAULT_OPERATOR_SCOPES, WRITE_SCOPE } from "../method-scopes.js";

// Proxies fronting a pre-rebrand install still stamp the legacy header spelling.
const OPERATOR_SCOPES_HEADERS = ["x-GreenchClaw-scopes", "x-openclaw-scopes"] as const;

export type PluginRouteRuntimeScopeSurface = "write-default" | "trusted-operator";

function readDeclaredScopesHeader(req: IncomingMessage): string | undefined {
  for (const name of OPERATOR_SCOPES_HEADERS) {
    const value = getHeader(req, name);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function resolvePluginRouteRuntimeOperatorScopes(
  req: IncomingMessage,
  requestAuth: AuthorizedGatewayHttpRequest,
  surface: PluginRouteRuntimeScopeSurface = "write-default",
): string[] {
  if (surface === "trusted-operator") {
    if (!requestAuth.trustDeclaredOperatorScopes) {
      return [...CLI_DEFAULT_OPERATOR_SCOPES];
    }
    if (readDeclaredScopesHeader(req) === undefined) {
      // Trusted-proxy clients that opt into the trusted-operator surface but send
      // no scope header run with the full operator defaults; an explicit header
      // still narrows the scope set.
      return [...CLI_DEFAULT_OPERATOR_SCOPES];
    }
    return resolveTrustedHttpOperatorScopes(req, requestAuth);
  }
  if (requestAuth.authMethod !== "trusted-proxy") {
    return [WRITE_SCOPE];
  }
  if (readDeclaredScopesHeader(req) === undefined) {
    return [WRITE_SCOPE];
  }
  return resolveTrustedHttpOperatorScopes(req, requestAuth);
}
