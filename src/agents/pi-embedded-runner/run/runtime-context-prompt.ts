import {
  GREENCHCLAW_NEXT_TURN_RUNTIME_CONTEXT_HEADER,
  GREENCHCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE,
  GREENCHCLAW_RUNTIME_CONTEXT_NOTICE,
  GREENCHCLAW_RUNTIME_EVENT_HEADER,
} from "../../internal-runtime-context.js";
import type { CurrentTurnPromptContext } from "./params.js";
export { GREENCHCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE };

const GREENCHCLAW_RUNTIME_EVENT_USER_PROMPT = "Continue the GreenchClaw runtime event.";

// A runtime-only turn has no author. When such a turn is persisted, the transcript stores a
// user-role message whose text is GREENCHCLAW_RUNTIME_EVENT_USER_PROMPT, but its companion
// `runtimeSystemContext` (the "runtime-generated, not user-authored" notice) lives only in the
// system prompt for that single run and does NOT survive history replay. On replay the turn then
// looks like a genuine user instruction (this was observed live: an assistant treated a
// rehydrated runtime-continuation message as a real user request).
//
// Fix: make the persisted prompt SELF-IDENTIFYING. The header line already names the runtime
// event; we keep the human-readable continuation line intact (prompt behaviour is unchanged) and
// expose a stable predicate so history consumers can detect and skip/render it as non-user.
export function isRuntimeEventUserPrompt(text: string | undefined | null): boolean {
  if (typeof text !== "string") {
    return false;
  }
  const trimmed = text.trim();
  return trimmed === GREENCHCLAW_RUNTIME_EVENT_USER_PROMPT || trimmed.startsWith(GREENCHCLAW_RUNTIME_EVENT_HEADER);
}

type RuntimeContextSession = {
  sendCustomMessage: (
    message: {
      customType: string;
      content: string;
      display: boolean;
      details?: Record<string, unknown>;
    },
    options?: { deliverAs?: "nextTurn"; triggerTurn?: boolean },
  ) => Promise<void>;
};

type RuntimeContextPromptParts = {
  prompt: string;
  runtimeContext?: string;
  runtimeOnly?: boolean;
  runtimeSystemContext?: string;
};

export function buildCurrentTurnPromptContextPrefix(
  context: CurrentTurnPromptContext | undefined,
): string {
  return context?.text.trim() ?? "";
}

export function buildCurrentTurnPrompt(params: {
  context: CurrentTurnPromptContext | undefined;
  prompt: string;
}): string {
  const prefix = buildCurrentTurnPromptContextPrefix(params.context);
  if (!prefix) {
    return params.prompt;
  }
  if (!params.prompt) {
    return prefix;
  }
  return [prefix, params.prompt].join(params.context?.promptJoiner ?? "\n\n");
}

function removeLastPromptOccurrence(text: string, prompt: string): string | null {
  const index = text.lastIndexOf(prompt);
  if (index === -1) {
    return null;
  }
  const before = text.slice(0, index).trimEnd();
  const after = text.slice(index + prompt.length).trimStart();
  return [before, after]
    .filter((part) => part.length > 0)
    .join("\n\n")
    .trim();
}

export function resolveRuntimeContextPromptParts(params: {
  effectivePrompt: string;
  transcriptPrompt?: string;
}): RuntimeContextPromptParts {
  const transcriptPrompt = params.transcriptPrompt;
  if (transcriptPrompt === undefined || transcriptPrompt === params.effectivePrompt) {
    return { prompt: params.effectivePrompt };
  }

  const prompt = transcriptPrompt.trim();
  const runtimeContext =
    removeLastPromptOccurrence(params.effectivePrompt, transcriptPrompt)?.trim() ||
    params.effectivePrompt.trim();
  if (!prompt) {
    return runtimeContext
      ? {
          // Self-identifying: the header line marks this turn as a runtime event so a replayed
          // transcript never mistakes it for a user instruction (see isRuntimeEventUserPrompt).
          prompt: `${GREENCHCLAW_RUNTIME_EVENT_HEADER}\n${GREENCHCLAW_RUNTIME_EVENT_USER_PROMPT}`,
          runtimeContext,
          runtimeOnly: true,
          runtimeSystemContext: buildRuntimeEventSystemContext(runtimeContext),
        }
      : { prompt: "" };
  }

  return runtimeContext ? { prompt, runtimeContext } : { prompt };
}

function buildRuntimeContextMessageContent(params: {
  runtimeContext: string;
  kind: "next-turn" | "runtime-event";
}): string {
  return [
    params.kind === "runtime-event"
      ? GREENCHCLAW_RUNTIME_EVENT_HEADER
      : GREENCHCLAW_NEXT_TURN_RUNTIME_CONTEXT_HEADER,
    GREENCHCLAW_RUNTIME_CONTEXT_NOTICE,
    "",
    params.runtimeContext,
  ].join("\n");
}

export function buildRuntimeContextSystemContext(runtimeContext: string): string {
  return buildRuntimeContextMessageContent({ runtimeContext, kind: "next-turn" });
}

export function buildRuntimeEventSystemContext(runtimeContext: string): string {
  return buildRuntimeContextMessageContent({ runtimeContext, kind: "runtime-event" });
}

export async function queueRuntimeContextForNextTurn(params: {
  session: RuntimeContextSession;
  runtimeContext?: string;
}): Promise<void> {
  const runtimeContext = params.runtimeContext?.trim();
  if (!runtimeContext) {
    return;
  }
  await params.session.sendCustomMessage(
    {
      customType: GREENCHCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE,
      content: runtimeContext,
      display: false,
      details: { source: "GreenchClaw-runtime-context" },
    },
    { deliverAs: "nextTurn" },
  );
}
