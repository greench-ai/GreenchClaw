import path from "node:path";
import { resolvePreferredGreenchClawTmpDir } from "../infra/tmp-GreenchClaw-dir.js";
export {
  resolveExistingPathsWithinRoot,
  pathScope,
  resolvePathsWithinRoot,
  resolvePathWithinRoot,
  resolveStrictExistingPathsWithinRoot,
  resolveWritablePathWithinRoot,
} from "../sdk-security-runtime.js";

const DEFAULT_FALLBACK_BROWSER_TMP_DIR = "/tmp/GreenchClaw";

function canUseNodeFs(): boolean {
  const getBuiltinModule = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => unknown;
    }
  ).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    return false;
  }
  try {
    return getBuiltinModule("fs") !== undefined;
  } catch {
    return false;
  }
}

const DEFAULT_BROWSER_TMP_DIR = canUseNodeFs()
  ? resolvePreferredGreenchClawTmpDir()
  : DEFAULT_FALLBACK_BROWSER_TMP_DIR;
export const DEFAULT_TRACE_DIR = DEFAULT_BROWSER_TMP_DIR;
export const DEFAULT_DOWNLOAD_DIR = path.join(DEFAULT_BROWSER_TMP_DIR, "downloads");
export const DEFAULT_UPLOAD_DIR = path.join(DEFAULT_BROWSER_TMP_DIR, "uploads");
