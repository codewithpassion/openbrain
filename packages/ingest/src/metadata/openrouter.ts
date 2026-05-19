import { ThoughtMetadata } from "@openbrains/shared";
import type { MetadataExtractor } from "./types";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * System prompt for metadata extraction. Modeled on OB1's prompt — asks the
 * LLM to emit a single JSON object with the five fields our schema expects.
 *
 * We pin the field names here so the test can verify they're present, and so
 * any future drift between prompt and schema is caught.
 */
const SYSTEM_PROMPT = [
  "You extract structured metadata from a single short thought or note.",
  "Respond with one JSON object only, no commentary. Schema:",
  "{",
  '  "type": "observation" | "task" | "idea" | "reference" | "person_note",',
  '  "topics": string[],          // short topic tags',
  '  "people": string[],          // names of people mentioned',
  '  "action_items": string[],    // imperative actions implied by the note',
  '  "dates_mentioned": string[]  // ISO YYYY-MM-DD only',
  "}",
  "If a field is unknown, return an empty array (or omit `type`).",
].join("\n");

const FALLBACK_METADATA = {
  type: "observation" as const,
  topics: ["uncategorized"],
  people: [],
  action_items: [],
  dates_mentioned: [],
};

interface OpenRouterChoice {
  readonly message?: { readonly content?: string };
}

interface OpenRouterResponse {
  readonly choices?: readonly OpenRouterChoice[];
}

/**
 * Narrow callable type for the fetch-like dependency. We only need
 * `(url, init) => Promise<Response>`; `typeof fetch` carries vendor-specific
 * extras (e.g. Bun's `preconnect`) that would force test fakes to fake them.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function createOpenRouterMetadataExtractor(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  fallback?: MetadataExtractor;
}): MetadataExtractor {
  const apiKey = opts.apiKey;
  const model = opts.model ?? DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = opts.fetch ?? fetch;
  const fallback = opts.fallback;

  function onFailure(content: string): Promise<ThoughtMetadata> {
    if (fallback) {
      return fallback.extract(content);
    }
    return Promise.resolve(ThoughtMetadata.parse(FALLBACK_METADATA));
  }

  async function extract(content: string): Promise<ThoughtMetadata> {
    try {
      const response = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content },
          ],
        }),
      });
      if (!response.ok) {
        return onFailure(content);
      }
      const body = (await response.json()) as OpenRouterResponse;
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") {
        return onFailure(content);
      }
      const parsed = safeJsonParse(text);
      if (parsed === undefined) {
        return onFailure(content);
      }
      const result = ThoughtMetadata.safeParse(parsed);
      if (!result.success) {
        return onFailure(content);
      }
      return result.data;
    } catch {
      // Any network/parse explosion delegates to the configured fallback,
      // or the static safe default. The ingestion pipeline always needs
      // *some* metadata to proceed.
      return onFailure(content);
    }
  }

  return { extract };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
