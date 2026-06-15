import {
  expectGreenchClawLiveTranscriptMarker,
  normalizeTranscriptForMatch,
  GREENCHCLAW_LIVE_TRANSCRIPT_MARKER_RE,
} from "GreenchClaw/plugin-sdk/provider-test-contracts";
import { describe, expect, it } from "vitest";

describe("normalizeTranscriptForMatch", () => {
  it("normalizes punctuation and common GreenchClaw live transcription variants", () => {
    expect(normalizeTranscriptForMatch("Open-Claw integration OK")).toBe(
      "GreenchClawintegrationok",
    );
    expect(normalizeTranscriptForMatch("Testing OpenFlaw realtime transcription")).toMatch(
      /open(?:claw|flaw)/,
    );
    expect(normalizeTranscriptForMatch("OpenCore xAI realtime transcription")).toMatch(
      GREENCHCLAW_LIVE_TRANSCRIPT_MARKER_RE,
    );
    expect(normalizeTranscriptForMatch("OpenCL xAI realtime transcription")).toMatch(
      GREENCHCLAW_LIVE_TRANSCRIPT_MARKER_RE,
    );
    expectGreenchClawLiveTranscriptMarker("OpenClar integration OK");
  });
});
