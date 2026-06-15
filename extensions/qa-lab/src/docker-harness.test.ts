import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildQaDockerHarnessImage, writeQaDockerHarnessFiles } from "./docker-harness.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe("qa docker harness", () => {
  it("writes compose, env, config, and workspace scaffold files", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "qa-docker-test-"));
    cleanups.push(async () => {
      await rm(outputDir, { recursive: true, force: true });
    });

    const result = await writeQaDockerHarnessFiles({
      outputDir,
      gatewayPort: 18889,
      qaLabPort: 43124,
      gatewayToken: "qa-token",
      providerBaseUrl: "http://host.docker.internal:45123/v1",
      repoRoot: "/repo/GreenchClaw",
      usePrebuiltImage: true,
      bindUiDist: true,
    });

    for (const expectedFile of [
      path.join(outputDir, ".env.example"),
      path.join(outputDir, "README.md"),
      path.join(outputDir, "docker-compose.qa.yml"),
      path.join(outputDir, "state", "GreenchClaw.json"),
      path.join(outputDir, "state", "seed-workspace", "QA_KICKOFF_TASK.md"),
      path.join(outputDir, "state", "seed-workspace", "QA_SCENARIO_PLAN.md"),
      path.join(outputDir, "state", "seed-workspace", "QA_SCENARIOS.md"),
      path.join(outputDir, "state", "seed-workspace", "IDENTITY.md"),
    ]) {
      expect(result.files).toContain(expectedFile);
    }

    const compose = await readFile(path.join(outputDir, "docker-compose.qa.yml"), "utf8");
    expect(compose).toContain("image: GreenchClaw:qa-local-prebaked");
    expect(compose).toContain("qa-mock-openai:");
    expect(compose).toContain("18889:18789");
    expect(compose).toContain('      - "43124:43123"');
    expect(compose).toContain(":/opt/GreenchClaw-qa-lab-ui:ro");
    expect(compose).toContain("      - sh");
    expect(compose).toContain("      - -lc");
    expect(compose).toContain(
      '        - fetch("http://127.0.0.1:18789/healthz").then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))',
    );
    expect(compose).toContain("      - --control-ui-proxy-target");
    expect(compose).toContain('      - "http://GreenchClaw-qa-gateway:18789/"');
    expect(compose).toContain("      - --send-kickoff-on-start");
    expect(compose).toContain("      - --ui-dist-dir");
    expect(compose).toContain('      - "/opt/GreenchClaw-qa-lab-ui"');
    expect(compose).toContain(":/opt/GreenchClaw-repo:ro");
    expect(compose).toContain("./state:/opt/GreenchClaw-scaffold:ro");
    expect(compose).toContain(
      "cp -R /opt/GreenchClaw-scaffold/seed-workspace/. /tmp/GreenchClaw/workspace/",
    );
    expect(compose).toContain("GREENCHCLAW_CONFIG_PATH: /tmp/GreenchClaw/GreenchClaw.json");
    expect(compose).toContain("GREENCHCLAW_STATE_DIR: /tmp/GreenchClaw/state");
    expect(compose).toContain('GREENCHCLAW_NO_RESPAWN: "1"');

    const envExample = await readFile(path.join(outputDir, ".env.example"), "utf8");
    expect(envExample).toContain("GREENCHCLAW_GATEWAY_TOKEN=qa-token");
    expect(envExample).toContain("QA_BUS_BASE_URL=http://qa-lab:43123");
    expect(envExample).toContain("QA_PROVIDER_BASE_URL=http://host.docker.internal:45123/v1");
    expect(envExample).toContain("QA_LAB_URL=http://127.0.0.1:43124");

    const config = await readFile(path.join(outputDir, "state", "GreenchClaw.json"), "utf8");
    expect(config).toContain('"allowInsecureAuth": true');
    expect(config).toContain('"pluginToolsMcpBridge": true');
    expect(config).toContain('"openClawToolsMcpBridge": true');
    expect(config).toContain("/app/dist/control-ui");
    expect(config).toContain("C-3PO QA");
    expect(config).toContain('"/tmp/GreenchClaw/workspace"');

    const kickoff = await readFile(
      path.join(outputDir, "state", "seed-workspace", "QA_KICKOFF_TASK.md"),
      "utf8",
    );
    expect(kickoff).toContain("Lobster Invaders");

    const scenarios = await readFile(
      path.join(outputDir, "state", "seed-workspace", "QA_SCENARIOS.md"),
      "utf8",
    );
    expect(scenarios).toContain("```yaml qa-pack");
    expect(scenarios).toContain("subagent-fanout-synthesis");

    const readme = await readFile(path.join(outputDir, "README.md"), "utf8");
    expect(readme).toContain("in-process restarts inside Docker");
    expect(readme).toContain("pnpm qa:lab:watch");
  });

  it("builds the reusable QA image with bundled QA extensions", async () => {
    const calls: string[] = [];
    const result = await buildQaDockerHarnessImage(
      {
        repoRoot: "/repo/GreenchClaw",
        imageName: "GreenchClaw:qa-local-prebaked",
      },
      {
        async runCommand(command, args, cwd) {
          calls.push([command, ...args, `@${cwd}`].join(" "));
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.imageName).toBe("GreenchClaw:qa-local-prebaked");
    expect(calls).toEqual([
      "docker build -t GreenchClaw:qa-local-prebaked --build-arg GREENCHCLAW_EXTENSIONS=qa-channel qa-lab -f Dockerfile . @/repo/GreenchClaw",
    ]);
  });
});
