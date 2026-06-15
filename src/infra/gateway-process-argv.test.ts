import { describe, expect, it } from "vitest";
import { isGatewayArgv, parseProcCmdline, parseWindowsCmdline } from "./gateway-process-argv.js";

describe("parseProcCmdline", () => {
  it("splits null-delimited argv and trims empty entries", () => {
    expect(parseProcCmdline(" node \0 gateway \0\0 --port \0 18789 \0")).toEqual([
      "node",
      "gateway",
      "--port",
      "18789",
    ]);
  });

  it("keeps non-delimited single arguments and drops whitespace-only entries", () => {
    expect(parseProcCmdline(" gateway ")).toEqual(["gateway"]);
    expect(parseProcCmdline(" \0\t\0 ")).toStrictEqual([]);
  });
});

describe("parseWindowsCmdline", () => {
  it("splits unquoted tokens by whitespace", () => {
    expect(parseWindowsCmdline("node.exe gateway run")).toEqual(["node.exe", "gateway", "run"]);
  });

  it("handles double-quoted paths with spaces", () => {
    expect(
      parseWindowsCmdline('"C:\\Program Files\\node.exe" "C:\\my app\\dist\\index.js" gateway run'),
    ).toEqual(["C:\\Program Files\\node.exe", "C:\\my app\\dist\\index.js", "gateway", "run"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseWindowsCmdline("")).toStrictEqual([]);
    expect(parseWindowsCmdline("   ")).toStrictEqual([]);
  });

  it("collapses consecutive spaces outside quotes", () => {
    expect(parseWindowsCmdline("node.exe   gateway   run")).toEqual(["node.exe", "gateway", "run"]);
  });
});

describe("isGatewayArgv", () => {
  it("requires a gateway token", () => {
    expect(isGatewayArgv(["node", "dist/index.js", "--port", "18789"])).toBe(false);
  });

  it("matches known entrypoints across slash and case variants", () => {
    expect(isGatewayArgv(["NODE", "C:\\GreenchClaw\\DIST\\ENTRY.JS", "gateway"])).toBe(true);
    expect(isGatewayArgv(["bun", "/srv/GreenchClaw/scripts/run-node.mjs", "gateway"])).toBe(true);
    expect(isGatewayArgv(["node", "/srv/GreenchClaw/GreenchClaw.mjs", "gateway"])).toBe(true);
    expect(isGatewayArgv(["tsx", "/srv/GreenchClaw/src/entry.ts", "gateway"])).toBe(true);
    expect(isGatewayArgv(["tsx", "/srv/GreenchClaw/src/index.ts", "gateway"])).toBe(true);
  });

  it("matches the GreenchClaw executable but gates the gateway binary behind the opt-in flag", () => {
    expect(isGatewayArgv(["C:\\bin\\GreenchClaw.cmd", "gateway"])).toBe(true);
    expect(isGatewayArgv(["/usr/local/bin/GreenchClaw-gateway", "gateway"])).toBe(false);
    expect(
      isGatewayArgv(["/usr/local/bin/GreenchClaw-gateway", "gateway"], {
        allowGatewayBinary: true,
      }),
    ).toBe(true);
    expect(
      isGatewayArgv(["C:\\bin\\GreenchClaw-gateway.EXE", "gateway"], {
        allowGatewayBinary: true,
      }),
    ).toBe(true);
  });

  it("rejects unknown gateway argv even when the token is present", () => {
    expect(isGatewayArgv(["node", "/srv/GreenchClaw/custom.js", "gateway"])).toBe(false);
    expect(isGatewayArgv(["python", "gateway", "script.py"])).toBe(false);
  });
});
