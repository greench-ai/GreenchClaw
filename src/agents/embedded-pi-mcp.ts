import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import type { BundleMcpDiagnostic, BundleMcpServerConfig } from "../plugins/bundle-mcp.js";
import { loadMergedBundleMcpConfig } from "./bundle-mcp-config.js";

type EmbeddedPiMcpConfig = {
  mcpServers: Record<string, BundleMcpServerConfig>;
  diagnostics: BundleMcpDiagnostic[];
};

export function loadEmbeddedPiMcpConfig(params: {
  workspaceDir: string;
  cfg?: GreenchClawConfig;
}): EmbeddedPiMcpConfig {
  const bundleMcp = loadMergedBundleMcpConfig({
    workspaceDir: params.workspaceDir,
    cfg: params.cfg,
  });

  return {
    mcpServers: bundleMcp.config.mcpServers,
    diagnostics: bundleMcp.diagnostics,
  };
}
