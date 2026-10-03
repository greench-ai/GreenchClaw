#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeBuildStamp } from "./lib/local-build-metadata.mjs";

export { BUILD_STAMP_FILE, resolveGitHead, writeBuildStamp } from "./lib/local-build-metadata.mjs";

/** Resolve through symlinks so staging-root runs (scripts/ symlinked) still execute. */
function isInvokedAsMain() {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return (
      fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(argv1))
    );
  } catch {
    return import.meta.url === pathToFileURL(argv1).href;
  }
}

if (isInvokedAsMain()) {
  try {
    writeBuildStamp();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
