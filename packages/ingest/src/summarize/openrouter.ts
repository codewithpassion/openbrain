import type { FetchLike } from "../metadata/openrouter";
import type { DigestSourceThought, DigestSummarizer, DigestSummary } from "./types";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

const SYSTEM_PROMPT = [
  "You write a short, structured daily digest of someone's captured thoughts.",
  "Produce 4–8 bullet points. Each bullet is one sentence, present-tense,",
  "and references the *substance* of the thought, not its meta (e.g. don't",
  "write 'a thought about X' — write the claim). Group by topic when natural.",
  "If the input is empty, return the single line 'No thoughts captured.'.",
  "Plain markdown, no preamble, no closing remarks.",
].join("\n");

interface OpenRouterChoice {
  readonly message?: { readonly content?: string };
}

interface OpenRouterResponse {
  readonly choices?: readonly OpenRouterChoice[];
}

/**
 * OpenRouter-backed digest summarizer. Mirrors the metadata-extractor adapter
 * — same FetchLike injection, same fallback shape. Failure returns a marker
 * string rather than throwing; the caller can decide whether to persist.
 */
export function createOpenRouterDigestSummarizer(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: FetchLike;
}): DigestSummarizer {
  const apiKey = opts.apiKey;
  const model = opts.model ?? DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = opts.fetch ?? fetch;
  const generator = `openrouter:${model}`;

  function fallback(thoughtIds: readonly string[]): DigestSummary {
    return {
      summary:
        thoughtIds.length === 0
          ? "No thoughts captured."
          : `Digest unavailable — ${thoughtIds.length} thought(s) captured but the summarizer failed.`,
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
      const response = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPayload },
          ],
        }),
      });
      if (!response.ok) {
        return fallback(thoughtIds);
      }
      const body = (await response.json()) as OpenRouterResponse;
      const text = body.choices?.[0]?.message?.content;
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
