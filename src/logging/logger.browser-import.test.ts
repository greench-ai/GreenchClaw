import { importFreshModule } from "GreenchClaw/plugin-sdk/test-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredGreenchClawTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredGreenchClawTmpDir: ReturnType<typeof vi.fn>;
}> {
  const resolvePreferredGreenchClawTmpDir =
    params?.resolvePreferredGreenchClawTmpDir ??
    vi.fn(() => {
      throw new Error(
        "resolvePreferredGreenchClawTmpDir should not run during browser-safe import",
      );
    });

  vi.doMock("../infra/tmp-GreenchClaw-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-GreenchClaw-dir.js")>(
      "../infra/tmp-GreenchClaw-dir.js",
    );
    return {
      ...actual,
      resolvePreferredGreenchClawTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await importFreshModule<LoggerModule>(
    import.meta.url,
    "./logger.js?scope=browser-safe",
  );
  return { module, resolvePreferredGreenchClawTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.doUnmock("../infra/tmp-GreenchClaw-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredGreenchClawTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredGreenchClawTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/GreenchClaw");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/GreenchClaw/GreenchClaw.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredGreenchClawTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toStrictEqual({
      level: "silent",
      file: "/tmp/GreenchClaw/GreenchClaw.log",
      maxFileBytes: 100 * 1024 * 1024,
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(module.getLogger().info("browser-safe")).toBeUndefined();
    expect(resolvePreferredGreenchClawTmpDir).not.toHaveBeenCalled();
  });
});
