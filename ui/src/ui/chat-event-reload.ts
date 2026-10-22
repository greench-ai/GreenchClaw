import { extractText } from "./chat/message-extract.ts";
import type { ChatEventPayload } from "./controllers/chat.ts";
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.ts";

// A FINAL event whose text is only a partial token ("NO_REPL") is still silent — treat any
// prefix of NO_REPLY as non-renderable so the UI reloads history instead of painting a fragment.
const SILENT_REPLY_PREFIX_PATTERN = /^\s*N?O?_?R?E?P?L?Y?\s*$/;

function hasRenderableAssistantFinalMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const entry = message as Record<string, unknown>;
  const role = normalizeLowercaseStringOrEmpty(entry.role);
  if (role && role !== "assistant") {
    return false;
  }
  if (!("content" in entry) && !("text" in entry)) {
    return false;
  }
  const text = extractText(message);
  return typeof text === "string" && text.trim() !== "" && !SILENT_REPLY_PREFIX_PATTERN.test(text);
}

export function shouldReloadHistoryForFinalEvent(payload?: ChatEventPayload): boolean {
  return Boolean(
    payload && payload.state === "final" && !hasRenderableAssistantFinalMessage(payload.message),
  );
}
