import fs from "node:fs/promises";
import path from "node:path";
import {
  findExistingAncestor,
  pathScope as sdkPathScope,
} from "GreenchClaw/plugin-sdk/security-runtime";

export { createSubsystemLogger } from "GreenchClaw/plugin-sdk/logging-core";
export {
  ensurePortAvailable,
  extractErrorCode,
  formatErrorMessage,
  hasProxyEnvConfigured,
  isNotFoundPathError,
  isPathInside,
  isPrivateNetworkAllowedByPolicy,
  matchesHostnameAllowlist,
  normalizeHostname,
  pathScope,
  redactSensitiveText,
  resolveExistingPathsWithinRoot,
  resolvePinnedHostnameWithPolicy,
  resolvePathsWithinRoot,
  resolvePathWithinRoot,
  root,
  safeEqualSecret,
  sanitizeUntrustedFileName,
  resolveStrictExistingPathsWithinRoot,
  resolveWritablePathWithinRoot,
  FsSafeError,
  SsrFBlockedError,
  writeExternalFileWithinRoot,
  writeViaSiblingTempPath,
  wrapExternalContent,
} from "GreenchClaw/plugin-sdk/security-runtime";
export type { LookupFn, SsrFPolicy } from "GreenchClaw/plugin-sdk/security-runtime";

export async function ensureAbsoluteDirectory(
  dirPath: string,
  options?: { scopeLabel?: string; mode?: number },
): Promise<{ ok: true; path: string } | { ok: false; error: Error }> {
  const absolutePath = path.resolve(dirPath);
  const scopeLabel = options?.scopeLabel ?? "directory";
  const existingAncestor = await findExistingAncestor(absolutePath);
  if (!existingAncestor) {
    return { ok: false, error: new Error(`Invalid path: must stay within ${scopeLabel}`) };
  }
  if (existingAncestor === absolutePath) {
    try {
      const stat = await fs.lstat(absolutePath);
      if (!stat.isSymbolicLink() && stat.isDirectory()) {
        return { ok: true, path: absolutePath };
      }
    } catch {
      // Fall through to the uniform invalid-path result below.
    }
    return { ok: false, error: new Error(`Invalid path: must stay within ${scopeLabel}`) };
  }
  const result = await sdkPathScope(existingAncestor, {
    label: options?.scopeLabel ?? "directory",
  }).ensureDir(path.relative(existingAncestor, absolutePath), { mode: options?.mode });
  if (result.ok) {
    return result;
  }
  return { ok: false, error: new Error(result.error) };
}
