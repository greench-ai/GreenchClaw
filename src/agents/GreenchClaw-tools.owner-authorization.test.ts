import { describe, expect, it } from "vitest";
import {
  isGreenchClawOwnerOnlyCoreToolName,
  GREENCHCLAW_OWNER_ONLY_CORE_TOOL_NAMES,
} from "./tools/owner-only-tools.js";

describe("createGreenchClawTools owner authorization", () => {
  it("marks owner-only core tool names", () => {
    expect(GREENCHCLAW_OWNER_ONLY_CORE_TOOL_NAMES).toEqual(["cron", "gateway", "nodes"]);
    expect(isGreenchClawOwnerOnlyCoreToolName("cron")).toBe(true);
    expect(isGreenchClawOwnerOnlyCoreToolName("gateway")).toBe(true);
    expect(isGreenchClawOwnerOnlyCoreToolName("nodes")).toBe(true);
  });

  it("keeps canvas non-owner-only", () => {
    expect(isGreenchClawOwnerOnlyCoreToolName("canvas")).toBe(false);
  });
});
