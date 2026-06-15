import { afterEach, describe, expect, it, vi } from "vitest";
import { configHandlers, resolveConfigOpenCommand } from "./config.js";
import { createConfigHandlerHarness } from "./config.test-helpers.js";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async () => {
  const { mockNodeBuiltinModule } = await import("GreenchClaw/plugin-sdk/test-node-mocks");
  return mockNodeBuiltinModule(
    () => vi.importActual<typeof import("node:child_process")>("node:child_process"),
    {
      execFile: Object.assign(execFileMock, {
        __promisify__: vi.fn(),
      }) as typeof import("node:child_process").execFile,
    },
  );
});

function invokeExecFileCallback(args: unknown[], error: Error | null) {
  const callback = args.at(-1);
  if (typeof callback !== "function") {
    throw new Error("expected execFile callback");
  }
  callback(error);
}

describe("resolveConfigOpenCommand", () => {
  it("uses open on macOS", () => {
    expect(resolveConfigOpenCommand("/tmp/GreenchClaw.json", "darwin")).toEqual({
      command: "open",
      args: ["/tmp/GreenchClaw.json"],
    });
  });

  it("uses xdg-open on Linux", () => {
    expect(resolveConfigOpenCommand("/tmp/GreenchClaw.json", "linux")).toEqual({
      command: "xdg-open",
      args: ["/tmp/GreenchClaw.json"],
    });
  });

  it("uses a quoted PowerShell literal on Windows", () => {
    expect(resolveConfigOpenCommand(String.raw`C:\tmp\o'hai & calc.json`, "win32")).toEqual({
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        String.raw`Start-Process -LiteralPath 'C:\tmp\o''hai & calc.json'`,
      ],
    });
  });
});

describe("config.openFile", () => {
  afterEach(() => {
    delete process.env.GREENCHCLAW_CONFIG_PATH;
    vi.clearAllMocks();
  });

  it("opens the configured file without shell interpolation", async () => {
    process.env.GREENCHCLAW_CONFIG_PATH = "/tmp/config $(touch pwned).json";
    execFileMock.mockImplementation((...args: unknown[]) => {
      expect(["open", "xdg-open", "powershell.exe"]).toContain(args[0]);
      expect(args[1]).toEqual(["/tmp/config $(touch pwned).json"]);
      invokeExecFileCallback(args, null);
      return {} as never;
    });

    const { options, respond } = createConfigHandlerHarness({ method: "config.openFile" });
    await configHandlers["config.openFile"](options);

    expect(respond).toHaveBeenCalledWith(
      true,
      {
        ok: true,
        path: "/tmp/config $(touch pwned).json",
      },
      undefined,
    );
  });

  it("returns a generic error and logs details when the opener fails", async () => {
    process.env.GREENCHCLAW_CONFIG_PATH = "/tmp/config.json";
    execFileMock.mockImplementation((...args: unknown[]) => {
      invokeExecFileCallback(
        args,
        Object.assign(new Error("spawn xdg-open ENOENT"), { code: "ENOENT" }),
      );
      return {} as never;
    });

    const { options, respond, logGateway } = createConfigHandlerHarness({
      method: "config.openFile",
    });
    await configHandlers["config.openFile"](options);

    expect(respond).toHaveBeenCalledWith(
      true,
      {
        ok: false,
        path: "/tmp/config.json",
        error: "failed to open config file",
      },
      undefined,
    );
    expect(logGateway.warn).toHaveBeenCalledWith(
      "config.openFile failed path=/tmp/config.json: spawn xdg-open ENOENT",
    );
  });
});
