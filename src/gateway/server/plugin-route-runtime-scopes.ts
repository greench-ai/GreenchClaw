import type { IncomingMessage } from "node:http";
import {
  getHeader,
  resolveTrustedHttpOperatorScopes,
  type AuthorizedGatewayHttpRequest,
} from "../http-auth-utils.js";
import { CLI_DEFAULT_OPERATOR_SCOPES, WRITE_SCOPE } from "../method-scopes.js";

export type PluginRouteRuntimeScopeSurface = "write-default" | "trusted-operator";

export function resolvePluginRouteRuntimeOperatorScopes(
  req: IncomingMessage,
  requestAuth: AuthorizedGatewayHttpRequest,
  surface: PluginRouteRuntimeScopeSurface = "write-default",
): string[] {
  if (surface === "trusted-operator") {
    if (!requestAuth.trustDeclaredOperatorScopes) {
      return [...CLI_DEFAULT_OPERATOR_SCOPES];
    }
    // A trusted-proxy route that opted into the operator surface and declared no
    // scopes header still gets the trusted operator defaults; an explicit header
    // (including an empty one) stays authoritative.
    if (
      requestAuth.authMethod === "trusted-proxy" &&
      getHeader(req, "x-GreenchClaw-scopes") === undefined
    ) {
      return [...CLI_DEFAULT_OPERATOR_SCOPES];
    }
    return resolveTrustedHttpOperatorScopes(req, requestAuth);
  }
  if (requestAuth.authMethod !== "trusted-proxy") {
    return [WRITE_SCOPE];
  }
  if (getHeader(req, "x-GreenchClaw-scopes") === undefined) {
    return [WRITE_SCOPE];
  }
  return resolveTrustedHttpOperatorScopes(req, requestAuth);
}
