import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLoggingConfig } from "./config.js";

const originalArgv = process.argv;
const originalConfigPath = process.env.GREENCHCLAW_CONFIG_PATH;
let tempDirs: string[] = [];

function writeConfig(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "GreenchClaw-logging-config-"));
  tempDirs.push(dir);
  const configPath = path.join(dir, "GreenchClaw.json");
  fs.writeFileSync(configPath, source);
  process.env.GREENCHCLAW_CONFIG_PATH = configPath;
  return configPath;
}

describe("readLoggingConfig", () => {
  afterEach(() => {
    process.argv = originalArgv;
    if (originalConfigPath === undefined) {
      delete process.env.GREENCHCLAW_CONFIG_PATH;
    } else {
      process.env.GREENCHCLAW_CONFIG_PATH = originalConfigPath;
    }
    for (const dir of tempDirs) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
    tempDirs = [];
  });

  it("skips mutating config loads for config schema", () => {
    process.argv = ["node", "GreenchClaw", "config", "schema"];
    const configPath = writeConfig(`{ logging: { file: "/tmp/should-not-read.log" } }`);
    fs.rmSync(configPath);

    expect(readLoggingConfig()).toBeUndefined();
  });

  it("reads logging config directly from the active config path", () => {
    writeConfig(`{
      logging: {
        level: "debug",
        file: "/tmp/GreenchClaw-custom.log",
        maxFileBytes: 1234,
      },
    }`);

    expect(readLoggingConfig()).toStrictEqual({
      level: "debug",
      file: "/tmp/GreenchClaw-custom.log",
      maxFileBytes: 1234,
    });
  });

  it("supports JSON5 comments and trailing commas", () => {
    writeConfig(`{
      // users commonly keep comments in GreenchClaw.json
      logging: {
        consoleLevel: "warn",
      },
    }`);

    expect(readLoggingConfig()).toStrictEqual({
      consoleLevel: "warn",
    });
  });

  it("returns undefined for missing or malformed config files", () => {
    process.env.GREENCHCLAW_CONFIG_PATH = path.join(os.tmpdir(), "GreenchClaw-missing-config.json");
    expect(readLoggingConfig()).toBeUndefined();

    writeConfig(`{ logging: `);
    expect(readLoggingConfig()).toBeUndefined();
  });
});
