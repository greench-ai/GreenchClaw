import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSuiteTempRootTracker } from "../test-helpers/temp-dir.js";
import {
  appendConfigAuditRecord,
  createConfigWriteAuditRecordBase,
  finalizeConfigWriteAuditRecord,
  formatConfigOverwriteLogMessage,
  redactConfigAuditArgv,
  resolveConfigAuditLogPath,
} from "./io.audit.js";

function createAuditRecordBase(configPath: string) {
  return createConfigWriteAuditRecordBase({
    configPath,
    env: {} as NodeJS.ProcessEnv,
    existsBefore: true,
    previousHash: "prev-hash",
    nextHash: "next-hash",
    previousBytes: 12,
    nextBytes: 24,
    previousMetadata: {
      dev: "10",
      ino: "11",
      mode: 0o600,
      nlink: 1,
      uid: 501,
      gid: 20,
    },
    changedPathCount: 1,
    hasMetaBefore: true,
    hasMetaAfter: true,
    gatewayModeBefore: "local",
    gatewayModeAfter: "local",
    suspicious: [],
    now: "2026-04-07T08:00:00.000Z",
  });
}

function createRenameAuditRecord(home: string) {
  return finalizeConfigWriteAuditRecord({
    base: createAuditRecordBase(path.join(home, ".GreenchClaw", "GreenchClaw.json")),
    result: "rename",
    nextMetadata: {
      dev: "12",
      ino: "13",
      mode: 0o600,
      nlink: 1,
      uid: 501,
      gid: 20,
    },
  });
}

function readAuditLog(home: string): unknown[] {
  const auditPath = path.join(home, ".GreenchClaw", "logs", "config-audit.jsonl");
  return fs
    .readFileSync(auditPath, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function requireAuditRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected audit JSONL record");
  }
  return value as Record<string, unknown>;
}

describe("config io audit helpers", () => {
  const suiteRootTracker = createSuiteTempRootTracker({ prefix: "GreenchClaw-config-audit-" });

  beforeAll(async () => {
    await suiteRootTracker.setup();
  });

  afterAll(async () => {
    await suiteRootTracker.cleanup();
  });

  it('ignores literal "undefined" home env values when choosing the audit log path', async () => {
    const home = await suiteRootTracker.make("home");
    const auditPath = resolveConfigAuditLogPath(
      {
        HOME: "undefined",
        USERPROFILE: "null",
        GREENCHCLAW_HOME: "undefined",
      } as NodeJS.ProcessEnv,
      () => home,
    );
    expect(auditPath).toBe(path.join(home, ".GreenchClaw", "logs", "config-audit.jsonl"));
    expect(auditPath.startsWith(path.resolve("undefined"))).toBe(false);
  });

  it("formats overwrite warnings with hash transition and backup path", () => {
    expect(
      formatConfigOverwriteLogMessage({
        configPath: "/tmp/GreenchClaw.json",
        previousHash: "prev-hash",
        nextHash: "next-hash",
        changedPathCount: 3,
      }),
    ).toBe(
      "Config overwrite: /tmp/GreenchClaw.json (sha256 prev-hash -> next-hash, backup=/tmp/GreenchClaw.json.bak, changedPaths=3)",
    );
  });

  it("captures watch markers and next stat metadata for successful writes", () => {
    const base = createConfigWriteAuditRecordBase({
      configPath: "/tmp/GreenchClaw.json",
      env: {
        GREENCHCLAW_WATCH_MODE: "1",
        GREENCHCLAW_WATCH_SESSION: "watch-session-1",
        GREENCHCLAW_WATCH_COMMAND: "gateway --force",
      } as NodeJS.ProcessEnv,
      existsBefore: true,
      previousHash: "prev-hash",
      nextHash: "next-hash",
      previousBytes: 12,
      nextBytes: 24,
      previousMetadata: {
        dev: "10",
        ino: "11",
        mode: 0o600,
        nlink: 1,
        uid: 501,
        gid: 20,
      },
      changedPathCount: 2,
      hasMetaBefore: false,
      hasMetaAfter: true,
      gatewayModeBefore: null,
      gatewayModeAfter: "local",
      suspicious: ["missing-meta-before-write"],
      now: "2026-04-07T08:00:00.000Z",
      processInfo: {
        pid: 101,
        ppid: 99,
        cwd: "/work",
        argv: ["node", "GreenchClaw"],
        execArgv: ["--loader"],
      },
    });
    const record = finalizeConfigWriteAuditRecord({
      base,
      result: "rename",
      nextMetadata: {
        dev: "12",
        ino: "13",
        mode: 0o600,
        nlink: 1,
        uid: 501,
        gid: 20,
      },
    });

    expect(record.watchMode).toBe(true);
    expect(record.watchSession).toBe("watch-session-1");
    expect(record.watchCommand).toBe("gateway --force");
    expect(record.nextHash).toBe("next-hash");
    expect(record.nextBytes).toBe(24);
    expect(record.nextDev).toBe("12");
    expect(record.nextIno).toBe("13");
    expect(record.result).toBe("rename");
  });

  it("drops next-file metadata and preserves error details for failed writes", () => {
    const base = createAuditRecordBase("/tmp/GreenchClaw.json");
    const err = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    const record = finalizeConfigWriteAuditRecord({
      base,
      result: "failed",
      err,
    });

    expect(record.result).toBe("failed");
    expect(record.nextHash).toBeNull();
    expect(record.nextBytes).toBeNull();
    expect(record.nextDev).toBeNull();
    expect(record.errorCode).toBe("ENOSPC");
    expect(record.errorMessage).toBe("disk full");
  });

  it("appends JSONL audit entries to the resolved audit path", async () => {
    const home = await suiteRootTracker.make("append");
    const record = createRenameAuditRecord(home);

    await appendConfigAuditRecord({
      fs,
      env: {} as NodeJS.ProcessEnv,
      homedir: () => home,
      record,
    });

    const records = readAuditLog(home);
    expect(records).toHaveLength(1);
    const written = requireAuditRecord(records[0]);
    expect(written.event).toBe("config.write");
    expect(written.result).toBe("rename");
    expect(written.nextHash).toBe("next-hash");
  });

  it("redacts structured audit records before persistence", async () => {
    const home = await suiteRootTracker.make("append-redacted");
    const record = finalizeConfigWriteAuditRecord({
      base: {
        ...createAuditRecordBase(path.join(home, ".GreenchClaw", "GreenchClaw.json")),
        suspicious: [
          "provider returned ya29.fake-access-token-with-enough-length",
          "plugin returned AIzaSyD-very-real-looking-google-api-key-123",
        ],
      },
      result: "failed",
      err: Object.assign(new Error("payload contained abcd-efgh-ijkl-mnop"), { code: "EFAIL" }),
    });

    await appendConfigAuditRecord({
      fs,
      env: {} as NodeJS.ProcessEnv,
      homedir: () => home,
      record,
    });

    const raw = fs.readFileSync(
      path.join(home, ".GreenchClaw", "logs", "config-audit.jsonl"),
      "utf-8",
    );
    expect(raw).not.toContain("AIzaSyD-very-real-looking");
    expect(raw).not.toContain("ya29.fake-access-token");
    expect(raw).not.toContain("abcd-efgh-ijkl-mnop");
  });

  it("redacts argv values that follow known secret flag names", () => {
    const argv = [
      "node",
      "GreenchClaw",
      "gateway",
      "--token",
      "super-secret-gateway-token-12345",
      "--api-key",
      "sk-very-real-looking-openai-api-key-AB12CD34",
      "--port",
      "8080",
    ];
    const result = redactConfigAuditArgv(argv);
    expect(result).toEqual([
      "node",
      "GreenchClaw",
      "gateway",
      "--token",
      "***",
      "--api-key",
      "***",
      "--port",
      "8080",
    ]);
  });

  it("redacts the value half of `--flag=value` for secret flags", () => {
    const argv = ["GreenchClaw", "--token=ghp_realgithubtoken1234567890ABCD", "--port=8080"];
    expect(redactConfigAuditArgv(argv)).toEqual(["GreenchClaw", "--token=***", "--port=8080"]);
  });

  it("redacts standalone token shapes via the shared logging redaction patterns", () => {
    const argv = [
      "node",
      "GreenchClaw",
      "ghp_realgithubtoken1234567890ABCD",
      "AIzaSyD-very-real-looking-google-api-key-123",
      "987654321:AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ];
    const result = redactConfigAuditArgv(argv);
    expect(result[0]).toBe("node");
    expect(result[1]).toBe("GreenchClaw");
    for (const masked of result.slice(2)) {
      expect(masked).not.toContain("ghp_realgithubtoken");
      expect(masked).not.toContain("AIzaSyD-very-real-looking");
      expect(masked).not.toMatch(/AAAAAAAAAAAAAA/);
    }
  });

  it("leaves non-secret arguments untouched", () => {
    const argv = ["node", "GreenchClaw", "gateway", "--port", "8080", "--bind", "lan"];
    expect(redactConfigAuditArgv(argv)).toEqual(argv);
  });

  it("redacts unknown but credential-suffixed flags via the heuristic classifier", () => {
    const argv = [
      "node",
      "GreenchClaw",
      "--custom-api-key",
      "real-tenant-key-AB12CD34EF56GH78",
      "--alibaba-model-studio-api-key=plain-value-xyz-12345",
      "--app-token",
      "another-secret-value",
      "--frobnicate-credential=hidden",
    ];
    const result = redactConfigAuditArgv(argv);
    expect(result).toEqual([
      "node",
      "GreenchClaw",
      "--custom-api-key",
      "***",
      "--alibaba-model-studio-api-key=***",
      "--app-token",
      "***",
      "--frobnicate-credential=***",
    ]);
  });

  it("redacts key-valued secret flags (Nostr --private-key, Matrix --recovery-key)", () => {
    const argv = [
      "node",
      "GreenchClaw",
      "channels",
      "add",
      "--channel",
      "nostr",
      "--private-key",
      "nsec1realnostrprivatekeyvaluexyz1234567890",
      "--recovery-key=EsTb-ABCD-1234-EFGH-5678-IJKL-9012-MNOP",
    ];
    const result = redactConfigAuditArgv(argv);
    expect(result).toEqual([
      "node",
      "GreenchClaw",
      "channels",
      "add",
      "--channel",
      "nostr",
      "--private-key",
      "***",
      "--recovery-key=***",
    ]);
  });

  it("redacts unknown *-key flags via the heuristic classifier (private/signing/master/etc.)", () => {
    const argv = [
      "node",
      "GreenchClaw",
      "--my-plugin-private-key",
      "tenant-private-key-material-zzz",
      "--rotated-signing-key=PEM-LIKE-MATERIAL",
      "--ops-master-key",
      "ABCDEF1234567890",
    ];
    const result = redactConfigAuditArgv(argv);
    expect(result).toEqual([
      "node",
      "GreenchClaw",
      "--my-plugin-private-key",
      "***",
      "--rotated-signing-key=***",
      "--ops-master-key",
      "***",
    ]);
  });

  it("masks the next arg after a secret flag even when it looks like another option", () => {
    const argv = ["GreenchClaw", "--token", "--port", "8080"];
    expect(redactConfigAuditArgv(argv)).toEqual(["GreenchClaw", "--token", "***", "8080"]);
  });

  it("redacts dash-leading secret values after bare secret flags", () => {
    const argv = ["GreenchClaw", "--password", "-secret-value"];
    expect(redactConfigAuditArgv(argv)).toEqual(["GreenchClaw", "--password", "***"]);
  });

  it("does not mask when a secret flag is the final arg with no value", () => {
    const argv = ["GreenchClaw", "--token"];
    expect(redactConfigAuditArgv(argv)).toEqual(["GreenchClaw", "--token"]);
  });

  it("caps caller-supplied processInfo argv at 8 entries before redaction", () => {
    const longArgv = [
      "node",
      "GreenchClaw",
      "--api-key",
      "secret",
      "--port",
      "8080",
      "--bind",
      "lan",
      "--leaks-here-token",
      "this-must-not-land-in-audit-1234567890",
    ];
    const base = createConfigWriteAuditRecordBase({
      configPath: "/tmp/GreenchClaw.json",
      env: {} as NodeJS.ProcessEnv,
      existsBefore: true,
      previousHash: "prev",
      nextHash: "next",
      previousBytes: 1,
      nextBytes: 2,
      previousMetadata: {
        dev: null,
        ino: null,
        mode: null,
        nlink: null,
        uid: null,
        gid: null,
      },
      changedPathCount: 0,
      hasMetaBefore: true,
      hasMetaAfter: true,
      gatewayModeBefore: "local",
      gatewayModeAfter: "local",
      suspicious: [],
      now: "2026-04-30T00:00:00.000Z",
      processInfo: {
        pid: 1,
        ppid: 1,
        cwd: "/work",
        argv: longArgv,
        execArgv: [],
      },
    });
    expect(base.argv).toHaveLength(8);
    expect(base.argv).not.toContain("this-must-not-land-in-audit-1234567890");
    expect(base.argv).not.toContain("--leaks-here-token");
  });

  it("redacts processInfo.argv when explicitly supplied to createConfigWriteAuditRecordBase", () => {
    const base = createConfigWriteAuditRecordBase({
      configPath: "/tmp/GreenchClaw.json",
      env: {} as NodeJS.ProcessEnv,
      existsBefore: true,
      previousHash: "prev",
      nextHash: "next",
      previousBytes: 1,
      nextBytes: 2,
      previousMetadata: {
        dev: null,
        ino: null,
        mode: null,
        nlink: null,
        uid: null,
        gid: null,
      },
      changedPathCount: 0,
      hasMetaBefore: true,
      hasMetaAfter: true,
      gatewayModeBefore: "local",
      gatewayModeAfter: "local",
      suspicious: [],
      now: "2026-04-30T00:00:00.000Z",
      processInfo: {
        pid: 1,
        ppid: 1,
        cwd: "/work",
        argv: ["node", "GreenchClaw", "--token", "leaked-but-not-anymore-12345"],
        execArgv: [],
      },
    });
    expect(base.argv).toEqual(["node", "GreenchClaw", "--token", "***"]);
  });

  it("also accepts flattened audit record params from legacy call sites", async () => {
    const home = await suiteRootTracker.make("append-flat");
    const record = createRenameAuditRecord(home);

    await appendConfigAuditRecord({
      fs,
      env: {} as NodeJS.ProcessEnv,
      homedir: () => home,
      ...record,
    });

    const records = readAuditLog(home);
    expect(records).toHaveLength(1);
    const written = requireAuditRecord(records[0]);
    expect(written.event).toBe("config.write");
    expect(written.result).toBe("rename");
    expect(written.nextHash).toBe("next-hash");
  });
});
