// Fact Extraction Engine — LLM-based structured memory extraction
// Part of Memory System v2

export type ExtractionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ExtractedFact = {
  id: string;
  text: string;
  attributed_to: "user" | "assistant";
  created_at: number;
  importance: number;
  metadata: Record<string, unknown>;
};

const EXTRACTION_PROMPT = `You are a Memory Extraction Agent. Extract factual memories from the conversation below.

Return ONLY valid JSON with this structure:
{"memory": [{"id": "0", "text": "...", "attributed_to": "user"}, ...]}

RULES:
- Extract EVERY distinct fact: name, job, hobby, preference, plan, experience, relationship — each as SEPARATE memory
- Each memory should be 10-60 words, self-contained, no pronouns
- "My name is X" or "I'm X" or "I am X" → extract name as separate fact: "Person's name is X"
- "I work at X as Y" or "I'm a Y at X" → extract job and employer separately
- "I have a X named Y" → extract as "Person has [pet/possession] named Y"
- attributed_to: "user" for facts about the user, "assistant" for facts stated by assistant
- Return empty memory list only for truly trivial conversation (just greetings)
- No fabrications — only extract what is explicitly stated
- Preserve specific details: names, dates, quantities, titles
- Detect language of input and respond in the same language

CONVERSATION:
MESSAGES_PLACEHOLDER

Return JSON:`;

function buildMessagesPrompt(messages: ExtractionMessage[]): string {
  const formatted = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  return EXTRACTION_PROMPT.replace("MESSAGES_PLACEHOLDER", formatted);
}

export async function extractFactsFromTurn(params: {
  messages: ExtractionMessage[];
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<{ memory: ExtractedFact[]; error?: string }> {
  const {
    messages,
    model = "anthropic/claude-3-haiku",
    apiKey,
    baseUrl = "https://openrouter.ai/api/v1",
    timeoutMs = 10_000,
  } = params;

  if (!messages.length || messages.every((m) => !m.content.trim())) {
    return { memory: [], error: undefined };
  }

  const prompt = buildMessagesPrompt(messages);
  const now = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { memory: [], error: `API error ${response.status}: ${text}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error?.message) {
      return { memory: [], error: data.error.message };
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { memory: [], error: "No content in response" };
    }

    // Parse JSON — try to extract from markdown code blocks first
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }
    // Also try direct JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*"memory"[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as {
      memory?: Array<{ id?: string; text?: string; attributed_to?: string }>;
    };
    const rawMemory = parsed.memory || [];

    const facts: ExtractedFact[] = rawMemory
      .filter((m): m is { id?: string; text: string; attributed_to?: string } =>
        Boolean(m.text && m.text.length >= 10),
      )
      .map((m, i) => ({
        id: m.id || `extracted-${now}-${i}`,
        text: m.text.slice(0, 500),
        attributed_to: (m.attributed_to === "assistant" ? "assistant" : "user") as
          | "user"
          | "assistant",
        created_at: now,
        importance: 0.5,
        metadata: {},
      }));

    return { memory: facts, error: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "The user aborted a request") {
      return { memory: [], error: "timeout" };
    }
    return { memory: [], error: message };
  }
}
