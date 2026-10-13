import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as providerAuthRuntime from "./provider-auth-runtime.js";

describe("plugin-sdk provider-auth-runtime", () => {
  it("exports the runtime-ready auth helper", () => {
    expect(providerAuthRuntime.getRuntimeAuthForModel).toBeTypeOf("function");
  });

  it("generates random OAuth state tokens", () => {
    const first = providerAuthRuntime.generateOAuthState();
    const second = providerAuthRuntime.generateOAuthState();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it("parses OAuth callback URLs and rejects bare codes", () => {
    expect(
      providerAuthRuntime.parseOAuthCallbackInput(
        "http://127.0.0.1:3000/callback?code=abc&state=state-1",
      ),
    ).toEqual({ code: "abc", state: "state-1" });
    expect(providerAuthRuntime.parseOAuthCallbackInput("abc")).toEqual({
      error: "Paste the full redirect URL, not just the code.",
    });
  });

  it("resolves the runtime model auth module when only hashed chunks exist", () => {
    // Regression: a release built without the runtime-postbuild alias phase ships
    // only `runtime-model-auth.runtime-<hash>.js` chunks (a real chunk + a thin
    // re-export wrapper). The resolver must fall back to the wrapper instead of
    // throwing, otherwise every embedding-backed feature (memory_search) dies.
    const tmp = mkdtempSync(path.join(tmpdir(), "gc-runtime-auth-"));
    try {
      writeFileSync(path.join(tmp, "runtime-model-auth.runtime-real1.js"), "\n//#region chunk\nexport const a = 1;\n");
      writeFileSync(
        path.join(tmp, "runtime-model-auth.runtime-wrap2.js"),
        'export * from "./runtime-model-auth.runtime-real1.js";\n',
      );
      const href = providerAuthRuntime.__resolveRuntimeModelAuthModuleHrefForTest(tmp);
      expect(href).toBeTruthy();
      expect(href).toContain("runtime-model-auth.runtime-wrap2.js");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
