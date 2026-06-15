import os from "node:os";
import { movePathToTrash as movePathToTrashWithAllowedRoots } from "GreenchClaw/plugin-sdk/browser-config";
import { resolvePreferredGreenchClawTmpDir } from "GreenchClaw/plugin-sdk/temp-path";

export async function movePathToTrash(targetPath: string): Promise<string> {
  return await movePathToTrashWithAllowedRoots(targetPath, {
    allowedRoots: [os.homedir(), resolvePreferredGreenchClawTmpDir()],
  });
}
