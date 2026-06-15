import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendJsonl,
  buildRttResult,
  buildRunId,
  createHarnessEnv,
  extractRtt,
  readTelegramSummary,
  safeRunLabel,
  validateGreenchClawPackageSpec,
} from "../../scripts/lib/rtt-harness.ts";
import { __testing as cliTesting } from "../../scripts/rtt.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(TEST_DIR, "../fixtures/telegram-qa-summary-rtt.json");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("RTT harness", () => {
  it("validates GreenchClaw package specs", () => {
    expect(validateGreenchClawPackageSpec("GreenchClaw@main")).toBe("GreenchClaw@main");
    expect(validateGreenchClawPackageSpec("GreenchClaw@alpha")).toBe("GreenchClaw@alpha");
    expect(validateGreenchClawPackageSpec("GreenchClaw@beta")).toBe("GreenchClaw@beta");
    expect(validateGreenchClawPackageSpec("GreenchClaw@latest")).toBe("GreenchClaw@latest");
    expect(validateGreenchClawPackageSpec("GreenchClaw@2026.4.30")).toBe("GreenchClaw@2026.4.30");
    expect(validateGreenchClawPackageSpec("GreenchClaw@2026.4.30-beta.2")).toBe(
      "GreenchClaw@2026.4.30-beta.2",
    );
    expect(validateGreenchClawPackageSpec("GreenchClaw@2026.4.30-alpha.2")).toBe(
      "GreenchClaw@2026.4.30-alpha.2",
    );

    expect(() => validateGreenchClawPackageSpec("@GreenchClaw/GreenchClaw@beta")).toThrow(
      /Package spec must be/,
    );
    expect(() => validateGreenchClawPackageSpec("GreenchClaw@next")).toThrow(
      /Package spec must be/,
    );
  });

  it("builds stable run labels", () => {
    expect(safeRunLabel("GreenchClaw@beta")).toBe("GreenchClaw_beta");
    expect(
      buildRunId({
        now: new Date("2026-05-01T03:04:05.678Z"),
        spec: "GreenchClaw@beta",
        index: 1,
      }),
    ).toBe("2026-05-01T030405678Z-GreenchClaw_beta-2");
  });

  it("constructs harness env without dropping caller env", () => {
    const env = createHarnessEnv({
      baseEnv: {
        GREENCHCLAW_QA_TELEGRAM_GROUP_ID: "-100123",
        GREENCHCLAW_NPM_TELEGRAM_FAST: "0",
      },
      providerMode: "mock-openai",
      rawOutputDir: ".artifacts/rtt/run/raw",
      samples: 20,
      sampleTimeoutMs: 30_000,
      scenarios: ["telegram-mentioned-message-reply"],
      spec: "GreenchClaw@beta",
      timeoutMs: 180_000,
      version: "2026.4.30-beta.1",
    });

    expect(env.GREENCHCLAW_QA_TELEGRAM_GROUP_ID).toBe("-100123");
    expect(env.GREENCHCLAW_NPM_TELEGRAM_PACKAGE_SPEC).toBe("GreenchClaw@beta");
    expect(env.GREENCHCLAW_NPM_TELEGRAM_PACKAGE_LABEL).toBe("GreenchClaw@beta (2026.4.30-beta.1)");
    expect(env.GREENCHCLAW_NPM_TELEGRAM_PROVIDER_MODE).toBe("mock-openai");
    expect(env.GREENCHCLAW_NPM_TELEGRAM_SCENARIOS).toBe("telegram-mentioned-message-reply");
    expect(env.GREENCHCLAW_NPM_TELEGRAM_OUTPUT_DIR).toBe(".artifacts/rtt/run/raw");
    expect(env.GREENCHCLAW_NPM_TELEGRAM_FAST).toBe("0");
    expect(env.GREENCHCLAW_NPM_TELEGRAM_WARM_SAMPLES).toBe("20");
    expect(env.GREENCHCLAW_NPM_TELEGRAM_SAMPLE_TIMEOUT_MS).toBe("30000");
    expect(env.GREENCHCLAW_QA_TELEGRAM_CANARY_TIMEOUT_MS).toBe("180000");
    expect(env.GREENCHCLAW_QA_TELEGRAM_SCENARIO_TIMEOUT_MS).toBe("180000");
  });

  it("extracts RTT values from Telegram QA summaries", async () => {
    const summary = await readTelegramSummary(FIXTURE_PATH);
    expect(extractRtt(summary)).toEqual({
      canaryMs: 1234,
      mentionReplyMs: 5000,
      warmSamples: [4000, 5000, 7000],
      avgMs: 5333,
      p50Ms: 5000,
      p95Ms: 7000,
      maxMs: 7000,
      failedSamples: 0,
    });
  });

  it("builds normalized result JSON", async () => {
    const summary = await readTelegramSummary(FIXTURE_PATH);
    const result = buildRttResult({
      artifacts: {
        rawObservedMessagesPath: "runs/run/raw/telegram-qa-observed-messages.json",
        rawReportPath: "runs/run/raw/telegram-qa-report.md",
        rawSummaryPath: "runs/run/raw/telegram-qa-summary.json",
        resultPath: "runs/run/result.json",
      },
      finishedAt: new Date("2026-05-01T00:00:12.000Z"),
      providerMode: "mock-openai",
      rawSummary: summary,
      runId: "run",
      scenarios: ["telegram-mentioned-message-reply"],
      spec: "GreenchClaw@beta",
      startedAt: new Date("2026-05-01T00:00:00.000Z"),
      version: "2026.4.30-beta.1",
    });

    expect(result).toStrictEqual({
      artifacts: {
        rawObservedMessagesPath: "runs/run/raw/telegram-qa-observed-messages.json",
        rawReportPath: "runs/run/raw/telegram-qa-report.md",
        rawSummaryPath: "runs/run/raw/telegram-qa-summary.json",
        resultPath: "runs/run/result.json",
      },
      package: { spec: "GreenchClaw@beta", version: "2026.4.30-beta.1" },
      run: {
        durationMs: 12_000,
        finishedAt: "2026-05-01T00:00:12.000Z",
        id: "run",
        startedAt: "2026-05-01T00:00:00.000Z",
        status: "pass",
      },
      mode: {
        providerMode: "mock-openai",
        scenarios: ["telegram-mentioned-message-reply"],
      },
      rtt: {
        canaryMs: 1234,
        mentionReplyMs: 5000,
        avgMs: 5333,
        p50Ms: 5000,
        p95Ms: 7000,
        maxMs: 7000,
        failedSamples: 0,
        warmSamples: [4000, 5000, 7000],
      },
    });
  });

  it("marks failed scenario summaries as failed results", () => {
    const result = buildRttResult({
      artifacts: {
        rawObservedMessagesPath: "runs/run/raw/telegram-qa-observed-messages.json",
        rawReportPath: "runs/run/raw/telegram-qa-report.md",
        rawSummaryPath: "runs/run/raw/telegram-qa-summary.json",
        resultPath: "runs/run/result.json",
      },
      finishedAt: new Date("2026-05-01T00:00:12.000Z"),
      providerMode: "mock-openai",
      rawSummary: {
        scenarios: [
          { id: "telegram-canary", rttMs: 5948, status: "pass" },
          { id: "telegram-mentioned-message-reply", status: "fail" },
        ],
      },
      runId: "run",
      scenarios: ["telegram-mentioned-message-reply"],
      spec: "GreenchClaw@latest",
      startedAt: new Date("2026-05-01T00:00:00.000Z"),
      version: "2026.4.29",
    });

    expect(result.run.status).toBe("fail");
    expect(result.rtt).toEqual({ canaryMs: 5948, mentionReplyMs: undefined });
  });

  it("appends JSONL rows", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-rtt-test-"));
    tempDirs.push(tempDir);
    const jsonlPath = path.join(tempDir, "data/rtt.jsonl");
    await appendJsonl(jsonlPath, { run: 1 });
    await appendJsonl(jsonlPath, { run: 2 });

    await expect(fs.readFile(jsonlPath, "utf8")).resolves.toBe('{"run":1}\n{"run":2}\n');
  });

  it("parses CLI options", () => {
    const parsed = cliTesting.parseArgs([
      "GreenchClaw@latest",
      "--package-tgz",
      "/tmp/GreenchClaw.tgz",
      "--provider",
      "live-frontier",
      "--runs",
      "3",
      "--samples",
      "5",
      "--sample-timeout-ms",
      "30000",
      "--timeout-ms",
      "240000",
      "--harness-root",
      "/tmp/GreenchClaw",
      "--output",
      "/tmp/runs",
    ]);

    expect(parsed.spec).toBe("GreenchClaw@latest");
    expect(parsed.options).toStrictEqual({
      packageTgz: "/tmp/GreenchClaw.tgz",
      providerMode: "live-frontier",
      runs: 3,
      samples: 5,
      sampleTimeoutMs: 30_000,
      harnessRoot: "/tmp/GreenchClaw",
      output: "/tmp/runs",
      scenarios: ["telegram-mentioned-message-reply"],
      timeoutMs: 240_000,
    });
  });
});
