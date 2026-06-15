import { existsSync } from "node:fs";
import path from "node:path";
import type { GreenchClawConfig } from "../../../config/types.GreenchClaw.js";
import { resolveBundledPluginInstallCommandHint } from "../../../plugins/bundled-sources.js";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../../../shared/string-coerce.js";

export function resolveAcpInstallCommandHint(cfg: GreenchClawConfig): string {
  const configured = normalizeOptionalString(cfg.acp?.runtime?.installCommand);
  if (configured) {
    return configured;
  }
  const workspaceDir = process.cwd();
  const backendId = normalizeOptionalLowercaseString(cfg.acp?.backend) ?? "acpx";
  if (backendId === "acpx") {
    const workspaceLocalPath = path.join(workspaceDir, "extensions", "acpx");
    if (existsSync(workspaceLocalPath)) {
      return `GreenchClaw plugins install ${workspaceLocalPath}`;
    }
    const bundledInstallHint = resolveBundledPluginInstallCommandHint({
      pluginId: backendId,
      workspaceDir,
    });
    if (bundledInstallHint) {
      const localPath = bundledInstallHint.replace(/^GreenchClaw plugins install /u, "");
      const resolvedLocalPath = path.resolve(localPath);
      const relativeToWorkspace = path.relative(workspaceDir, resolvedLocalPath);
      const belongsToWorkspace =
        relativeToWorkspace.length === 0 ||
        (!relativeToWorkspace.startsWith("..") && !path.isAbsolute(relativeToWorkspace));
      if (belongsToWorkspace && existsSync(resolvedLocalPath)) {
        return bundledInstallHint;
      }
    }
    return "GreenchClaw plugins install acpx";
  }
  return `Install and enable the plugin that provides ACP backend "${backendId}".`;
}
