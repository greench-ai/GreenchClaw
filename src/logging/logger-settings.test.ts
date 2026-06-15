import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let originalTestFileLog: string | undefined;
let originalGreenchClawLogLevel: string | undefined;
let logging: typeof import("../logging.js");

beforeAll(async () => {
  logging = await import("../logging.js");
});

beforeEach(() => {
  originalTestFileLog = process.env.GREENCHCLAW_TEST_FILE_LOG;
  originalGreenchClawLogLevel = process.env.GREENCHCLAW_LOG_LEVEL;
  delete process.env.GREENCHCLAW_TEST_FILE_LOG;
  delete process.env.GREENCHCLAW_LOG_LEVEL;
  logging.resetLogger();
  logging.setLoggerOverride(null);
});

afterEach(() => {
  if (originalTestFileLog === undefined) {
    delete process.env.GREENCHCLAW_TEST_FILE_LOG;
  } else {
    process.env.GREENCHCLAW_TEST_FILE_LOG = originalTestFileLog;
  }
  if (originalGreenchClawLogLevel === undefined) {
    delete process.env.GREENCHCLAW_LOG_LEVEL;
  } else {
    process.env.GREENCHCLAW_LOG_LEVEL = originalGreenchClawLogLevel;
  }
  logging.resetLogger();
  logging.setLoggerOverride(null);
  logging.setLoggerConfigLoaderForTests();
  vi.restoreAllMocks();
});

describe("getResolvedLoggerSettings", () => {
  it("uses a silent fast path in default Vitest mode without config reads", () => {
    const readLoggingConfig = vi.fn(() => undefined);
    logging.setLoggerConfigLoaderForTests(readLoggingConfig);

    const settings = logging.getResolvedLoggerSettings();

    expect(settings.level).toBe("silent");
    expect(readLoggingConfig).not.toHaveBeenCalled();
  });

  it("reads logging config when test file logging is explicitly enabled", () => {
    process.env.GREENCHCLAW_TEST_FILE_LOG = "1";
    logging.setLoggerConfigLoaderForTests(() => ({
      level: "debug",
      file: "/tmp/GreenchClaw-configured.log",
      maxFileBytes: 2048,
    }));

    const settings = logging.getResolvedLoggerSettings();

    expect(settings.level).toBe("debug");
    expect(settings.file).toBe("/tmp/GreenchClaw-configured.log");
    expect(settings.maxFileBytes).toBe(2048);
  });

  it("uses defaults when no logging config is available", () => {
    process.env.GREENCHCLAW_TEST_FILE_LOG = "1";
    logging.setLoggerConfigLoaderForTests(() => undefined);

    const settings = logging.getResolvedLoggerSettings();

    expect(settings.level).toBe("info");
  });
});
