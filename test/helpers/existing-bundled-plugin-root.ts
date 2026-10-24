import fs from "node:fs";
import path from "node:path";

/**
 * Pick the trusted bundled-plugin root that actually exists in this checkout.
 *
 * `dist/extensions` and `dist-runtime/extensions` are both trusted roots, but plain
 * checkouts and CI shards only contain `dist` (only `build-artifacts` produces
 * `dist-runtime`), so a hardcoded `dist-runtime` fixture root makes `mkdir` fail with
 * ENOENT on every job that does not build the runtime bundle.
 *
 * Duplicated from `src/test-utils/bundled-plugin-public-surface.ts` on purpose: the
 * extension test boundary forbids non-extension suites from importing that module
 * (it is the bundled-plugin public-surface test util), so core tests that only need
 * the root probe use this helper from the allowed `test/helpers/` tree.
 */
export function resolveExistingBundledPluginRoot(params: {
  packageRoot: string;
  preferredKind?: "dist-runtime" | "dist";
}): string {
  const kinds =
    params.preferredKind === "dist"
      ? (["dist", "dist-runtime"] as const)
      : (["dist-runtime", "dist"] as const);
  for (const kind of kinds) {
    const candidate = path.join(params.packageRoot, kind, "extensions");
    if (fs.existsSync(path.dirname(candidate))) {
      return candidate;
    }
  }
  return path.join(params.packageRoot, "extensions");
}
