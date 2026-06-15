import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCodexAppServerProtocolSource } from "../../scripts/lib/codex-app-server-protocol-source.js";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDir } = createScriptTestHarness();
const originalGreenchClawCodexRepo = process.env.GREENCHCLAW_CODEX_REPO;

afterEach(() => {
  if (originalGreenchClawCodexRepo === undefined) {
    delete process.env.GREENCHCLAW_CODEX_REPO;
  } else {
    process.env.GREENCHCLAW_CODEX_REPO = originalGreenchClawCodexRepo;
  }
});

describe("codex app-server protocol source resolver", () => {
  it("uses GREENCHCLAW_CODEX_REPO when provided", async () => {
    const root = createTempDir("GreenchClaw-protocol-source-root-");
    const codexRepo = createTempDir("GreenchClaw-protocol-source-codex-");
    createProtocolSchema(codexRepo);
    process.env.GREENCHCLAW_CODEX_REPO = codexRepo;

    await expect(resolveCodexAppServerProtocolSource(root)).resolves.toEqual({
      codexRepo,
      sourceRoot: path.join(codexRepo, "codex-rs/app-server-protocol/schema"),
    });
  });

  it("finds the primary checkout sibling from a git worktree", async () => {
    const parentDir = createTempDir("GreenchClaw-protocol-source-parent-");
    const primaryGreenchClaw = path.join(parentDir, "GreenchClaw");
    const codexRepo = path.join(parentDir, "codex");
    const worktreeRoot = createTempDir("GreenchClaw-protocol-source-worktree-");
    fs.mkdirSync(path.join(primaryGreenchClaw, ".git", "worktrees", "codex-harness"), {
      recursive: true,
    });
    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(
      path.join(worktreeRoot, ".git"),
      `gitdir: ${path.join(primaryGreenchClaw, ".git", "worktrees", "codex-harness")}\n`,
    );
    createProtocolSchema(codexRepo);
    delete process.env.GREENCHCLAW_CODEX_REPO;

    await expect(resolveCodexAppServerProtocolSource(worktreeRoot)).resolves.toEqual({
      codexRepo,
      sourceRoot: path.join(codexRepo, "codex-rs/app-server-protocol/schema"),
    });
  });
});

function createProtocolSchema(codexRepo: string): void {
  fs.mkdirSync(path.join(codexRepo, "codex-rs/app-server-protocol/schema/typescript"), {
    recursive: true,
  });
}
