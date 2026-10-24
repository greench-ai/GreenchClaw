import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { detectInstallSmokeScope } = (await import("../../scripts/ci-changed-scope.mjs")) as {
  detectInstallSmokeScope: (paths: string[]) => {
    runFastInstallSmoke: boolean;
    runFullInstallSmoke: boolean;
  };
};

const WORKFLOW_PATH = ".github/workflows/website-installer-sync.yml";

describe("website installer sync workflow", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");

  it("treats all website installer scripts as GreenchClaw-owned inputs", () => {
    for (const path of ["scripts/install.sh", "scripts/install-cli.sh", "scripts/install.ps1"]) {
      expect(workflow).toContain(path);
      expect(detectInstallSmokeScope([path]).runFullInstallSmoke).toBe(true);
    }
  });

  it("verifies installers on Linux Docker plus native macOS and Windows runners", () => {
    expect(workflow).toContain("linux-docker:");
    expect(workflow).toContain("docker run --rm");
    expect(workflow).toContain("bash /tmp/install.sh --no-prompt --no-onboard");
    expect(workflow).toContain("bash /tmp/install-cli.sh --prefix /tmp/GreenchClaw");
    expect(workflow).toContain("macos-installer:");
    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain('GREENCHCLAW_NO_ONBOARD: "1"');
    expect(workflow).toContain('GREENCHCLAW_NO_PROMPT: "1"');
    expect(workflow).toContain("bash scripts/install.sh --no-onboard --no-prompt --version latest");
    expect(workflow).toContain("GreenchClaw --version");
    expect(workflow).toContain("windows-installer:");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain(".\\scripts\\install.ps1 -DryRun");
    expect(workflow).not.toContain("install.cmd dry run");
    expect(workflow).not.toContain(".\\scripts\\install.cmd");
  });

  it("does not push installers into the retired OpenClaw-era site repos", () => {
    // GreenchClaw/GreenchClaw.ai, GreenchClaw/clawhub and GreenchClaw/docs do not exist under
    // this account; the job that copied scripts into them could only fail with
    // "Input required and not supplied: token". Verification is the whole workflow now.
    expect(workflow).not.toContain("GreenchClaw.ai");
    expect(workflow).not.toContain("GreenchClaw/clawhub");
    expect(workflow).not.toContain("GREENCHCLAW_GH_TOKEN");
    expect(workflow).not.toContain("sync-website:");
    expect(workflow).not.toContain("bun run build");
    expect(workflow).not.toContain("git push origin HEAD:main");
  });
});
