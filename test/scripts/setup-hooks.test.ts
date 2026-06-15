import path from "node:path";
import { describe, expect, it } from "vitest";
import { isDirectSetupHooksInvocation, runSetupHooks } from "../../scripts/setup-hooks.mjs";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDirAsync } = createScriptTestHarness();

describe("runSetupHooks", () => {
  it("skips when git is not on PATH", async () => {
    const cwd = await createTempDirAsync("setup-hooks-no-git-");
    const log = { log: () => {}, warn: () => {} };
    const result = runSetupHooks({
      cwd,
      hooksDir: path.join(cwd, "git-hooks"),
      hasGitFn: () => false,
      isInsideWorkTreeFn: () => true,
      readCurrentHooksPathFn: () => null,
      setHooksPathFn: () => {
        throw new Error("should not be called");
      },
      log,
    });
    expect(result).toEqual({ configured: false, reason: "no-git" });
  });

  it("skips when cwd is not a git work tree", async () => {
    const cwd = await createTempDirAsync("setup-hooks-not-worktree-");
    const log = { log: () => {}, warn: () => {} };
    const result = runSetupHooks({
      cwd,
      hooksDir: path.join(cwd, "git-hooks"),
      hasGitFn: () => true,
      isInsideWorkTreeFn: () => false,
      readCurrentHooksPathFn: () => null,
      setHooksPathFn: () => {
        throw new Error("should not be called");
      },
      log,
    });
    expect(result).toEqual({ configured: false, reason: "not-in-work-tree" });
  });

  it("is a no-op when core.hooksPath is already correct", async () => {
    const cwd = await createTempDirAsync("setup-hooks-already-set-");
    const log = { log: () => {}, warn: () => {} };
    const setCalls: string[] = [];
    const result = runSetupHooks({
      cwd,
      hooksDir: path.join(cwd, "git-hooks"),
      hasGitFn: () => true,
      isInsideWorkTreeFn: () => true,
      readCurrentHooksPathFn: () => "git-hooks",
      setHooksPathFn: (value: string) => {
        setCalls.push(value);
      },
      log,
    });
    expect(result).toEqual({ configured: true, alreadySet: true });
    expect(setCalls).toEqual([]);
  });

  it("configures core.hooksPath when unset", async () => {
    const cwd = await createTempDirAsync("setup-hooks-unset-");
    const log = { log: () => {}, warn: () => {} };
    const setCalls: string[] = [];
    const result = runSetupHooks({
      cwd,
      hooksDir: path.join(cwd, "git-hooks"),
      hasGitFn: () => true,
      isInsideWorkTreeFn: () => true,
      readCurrentHooksPathFn: () => null,
      setHooksPathFn: (value: string) => {
        setCalls.push(value);
      },
      log,
    });
    expect(result.configured).toBe(true);
    expect(result.alreadySet).toBe(false);
    expect(result.previous).toBeNull();
    expect(setCalls).toEqual(["git-hooks"]);
  });

  it("overrides a different core.hooksPath and reports the previous value", async () => {
    const cwd = await createTempDirAsync("setup-hooks-different-");
    const log = { log: () => {}, warn: () => {} };
    const setCalls: string[] = [];
    const result = runSetupHooks({
      cwd,
      hooksDir: path.join(cwd, "git-hooks"),
      hasGitFn: () => true,
      isInsideWorkTreeFn: () => true,
      readCurrentHooksPathFn: () => ".githooks",
      setHooksPathFn: (value: string) => {
        setCalls.push(value);
      },
      log,
    });
    expect(result.configured).toBe(true);
    expect(result.alreadySet).toBe(false);
    expect(result.previous).toBe(".githooks");
    expect(setCalls).toEqual(["git-hooks"]);
  });
});

describe("isDirectSetupHooksInvocation", () => {
  const modulePath = "/repo/scripts/setup-hooks.mjs";

  it("returns true when entry path resolves to the module path", () => {
    expect(
      isDirectSetupHooksInvocation({
        entryPath: "/repo/scripts/setup-hooks.mjs",
        modulePath,
      }),
    ).toBe(true);
  });

  it("returns false when entry path is a different script", () => {
    expect(
      isDirectSetupHooksInvocation({
        entryPath: "/repo/scripts/other.mjs",
        modulePath,
      }),
    ).toBe(false);
  });

  it("returns false when entry path is missing", () => {
    expect(
      isDirectSetupHooksInvocation({
        entryPath: undefined,
        modulePath,
      }),
    ).toBe(false);
  });
});
