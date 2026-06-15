import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnyAgentTool } from "./tools/common.js";

const mocks = vi.hoisted(() => {
  const stubTool = (name: string, ownerOnly = false) =>
    ({
      name,
      label: name,
      displaySummary: name,
      description: name,
      ownerOnly,
      parameters: { type: "object", properties: {} },
      execute: vi.fn(),
    }) satisfies AnyAgentTool;

  return {
    createGreenchClawToolsOptions: vi.fn(),
    stubTool,
  };
});

vi.mock("./GreenchClaw-tools.js", () => ({
  createGreenchClawTools: (options: unknown) => {
    mocks.createGreenchClawToolsOptions(options);
    return [mocks.stubTool("cron", true)];
  },
}));

import "./test-helpers/fast-bash-tools.js";
import "./test-helpers/fast-coding-tools.js";
import { createGreenchClawCodingTools } from "./pi-tools.js";

describe("createGreenchClawCodingTools cron scope", () => {
  beforeEach(() => {
    mocks.createGreenchClawToolsOptions.mockClear();
  });

  it("scopes the cron owner-only runtime grant to self-removal", () => {
    const tools = createGreenchClawCodingTools({
      trigger: "cron",
      jobId: "job-current",
      senderIsOwner: false,
      ownerOnlyToolAllowlist: ["cron"],
    });

    expect(tools.map((tool) => tool.name)).toContain("cron");
    const [options] = mocks.createGreenchClawToolsOptions.mock.calls.at(0) ?? [];
    expect(options?.cronSelfRemoveOnlyJobId).toBe("job-current");
  });

  it("does not scope ordinary owner cron sessions", () => {
    createGreenchClawCodingTools({
      trigger: "cron",
      jobId: "job-current",
      senderIsOwner: true,
    });

    const [options] = mocks.createGreenchClawToolsOptions.mock.calls.at(0) ?? [];
    expect(options?.cronSelfRemoveOnlyJobId).toBeUndefined();
  });
});
