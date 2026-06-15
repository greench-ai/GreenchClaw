import { describe, expect, it } from "vitest";
import { collectPresentGreenchClawTools } from "./GreenchClaw-tools.registration.js";
import { createPdfTool } from "./tools/pdf-tool.js";

describe("createGreenchClawTools PDF registration", () => {
  it("includes the pdf tool when the pdf factory returns a tool", () => {
    const pdfTool = createPdfTool({
      agentDir: "/tmp/GreenchClaw-agent-main",
      config: {
        agents: {
          defaults: {
            pdfModel: { primary: "openai/gpt-5.4-mini" },
          },
        },
      },
    });

    expect(pdfTool?.name).toBe("pdf");
    expect(collectPresentGreenchClawTools([pdfTool]).map((tool) => tool.name)).toContain("pdf");
  });
});
