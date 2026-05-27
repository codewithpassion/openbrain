import type { DigestSourceThought, DigestSummarizer, DigestSummary } from "./types";

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

const SYSTEM_PROMPT = [
  "You write a short, structured daily digest of someone's captured thoughts.",
  "Produce 4–8 bullet points. Each bullet is one sentence, present-tense,",
  "and references the *substance* of the thought, not its meta (e.g. don't",
  "write 'a thought about X' — write the claim). Group by topic when natural.",
  "If the input is empty, return the single line 'No thoughts captured.'.",
  "Plain markdown, no preamble, no closing remarks.",
].join("\n");

interface WorkersAiChatBinding {
  run(
    model: string,
    input: {
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
      readonly response_format?: { readonly type: "json_object" };
    },
  ): Promise<{ readonly response?: string }>;
}

/**
 * Workers AI-backed digest summarizer. Mirrors the OpenRouter adapter's
 * interface so callers can swap one for the other. Failure returns a fallback
 * marker rather than throwing; the caller decides whether to persist.
 */
export function createWorkersAiDigestSummarizer(opts: {
  ai: WorkersAiChatBinding;
  model?: string;
}): DigestSummarizer {
  const ai = opts.ai;
  const model = opts.model ?? DEFAULT_MODEL;
  const generator = `workers-ai:${model}`;

  function fallback(thoughtIds: readonly string[]): DigestSummary {
    return {
      summary:
        thoughtIds.length === 0
          ? "No thoughts captured."
          : `Digest unavailable — ${thoughtIds.length.toString()} thought(s) captured but the summarizer failed.`,
      thoughtIds,
      generator,
    };
  }

  async function summarize(thoughts: readonly DigestSourceThought[]): Promise<DigestSummary> {
    const thoughtIds = thoughts.map((t) => t.id);
    if (thoughts.length === 0) {
      return { summary: "No thoughts captured.", thoughtIds: [], generator };
    }
    const userPayload = thoughts
      .map((t) => {
        const typeTag = t.type === undefined ? "" : ` [${t.type}]`;
        const topics = t.topics.length === 0 ? "" : ` (topics: ${t.topics.join(", ")})`;
        return `- ${t.content}${typeTag}${topics}`;
      })
      .join("\n");

    try {
      const result = await ai.run(model, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPayload },
        ],
      });
      const text = result.response;
      if (typeof text !== "string" || text.trim().length === 0) {
        return fallback(thoughtIds);
      }
      return { summary: text.trim(), thoughtIds, generator };
    } catch {
      return fallback(thoughtIds);
    }
  }

  return { summarize };
}
