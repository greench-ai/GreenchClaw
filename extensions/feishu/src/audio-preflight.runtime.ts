import { transcribeFirstAudio as transcribeFirstAudioImpl } from "GreenchClaw/plugin-sdk/media-runtime";

type TranscribeFirstAudio =
  typeof import("GreenchClaw/plugin-sdk/media-runtime").transcribeFirstAudio;

export async function transcribeFirstAudio(
  ...args: Parameters<TranscribeFirstAudio>
): ReturnType<TranscribeFirstAudio> {
  return await transcribeFirstAudioImpl(...args);
}
