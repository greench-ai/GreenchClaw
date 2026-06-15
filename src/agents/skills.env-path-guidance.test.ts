import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

type GuidanceCase = {
  file: string;
  required?: string[];
  forbidden?: string[];
};

const CASES: GuidanceCase[] = [
  {
    file: "skills/session-logs/SKILL.md",
    required: ["GREENCHCLAW_STATE_DIR"],
    forbidden: [
      "for f in ~/.GreenchClaw/agents/<agentId>/sessions/*.jsonl",
      'rg -l "phrase" ~/.GreenchClaw/agents/<agentId>/sessions/*.jsonl',
      "~/.GreenchClaw/agents/<agentId>/sessions/<id>.jsonl",
    ],
  },
  {
    file: "skills/gh-issues/SKILL.md",
    required: ["GREENCHCLAW_CONFIG_PATH"],
    forbidden: ["cat ~/.GreenchClaw/GreenchClaw.json"],
  },
  {
    file: "skills/canvas/SKILL.md",
    required: ["GREENCHCLAW_CONFIG_PATH"],
    forbidden: ["cat ~/.GreenchClaw/GreenchClaw.json"],
  },
  {
    file: "skills/openai-whisper-api/SKILL.md",
    required: ["GREENCHCLAW_CONFIG_PATH"],
  },
  {
    file: "skills/sherpa-onnx-tts/SKILL.md",
    required: [
      "GREENCHCLAW_STATE_DIR",
      "GREENCHCLAW_CONFIG_PATH",
      'STATE_DIR="${GREENCHCLAW_STATE_DIR:-$HOME/.GreenchClaw}"',
    ],
    forbidden: [
      'SHERPA_ONGREENCH_RUNTIME_DIR: "~/.GreenchClaw/tools/sherpa-onnx-tts/runtime"',
      'SHERPA_ONGREENCH_MODEL_DIR: "~/.GreenchClaw/tools/sherpa-onnx-tts/models/vits-piper-en_US-lessac-high"',
      "<state-dir>",
    ],
  },
  {
    file: "skills/coding-agent/SKILL.md",
    required: ["GREENCHCLAW_STATE_DIR"],
    forbidden: ["NEVER start Codex in ~/.GreenchClaw/"],
  },
];

describe("bundled skill env-path guidance", () => {
  it.each(CASES)(
    "keeps $file aligned with OPENCLAW env overrides",
    ({ file, required, forbidden }) => {
      const content = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
      for (const needle of required ?? []) {
        expect(content).toContain(needle);
      }
      for (const needle of forbidden ?? []) {
        expect(content).not.toContain(needle);
      }
    },
  );
});
