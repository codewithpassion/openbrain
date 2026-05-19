import { ThoughtMetadata } from "@openbrains/shared";
import type { MetadataExtractor } from "./types";

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

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

export interface WorkersAiChatInput {
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
  readonly response_format?: { readonly type: "json_object" };
}

export interface WorkersAiChatBinding {
  run(model: string, input: WorkersAiChatInput): Promise<{ readonly response?: string }>;
}

export function createWorkersAiMetadataExtractor(opts: {
  ai: WorkersAiChatBinding;
  model?: string;
}): MetadataExtractor {
  const ai = opts.ai;
  const model = opts.model ?? DEFAULT_MODEL;

  async function extract(content: string): Promise<ThoughtMetadata> {
    try {
      const result = await ai.run(model, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      });
      const text = result.response;
      if (typeof text !== "string") {
        return ThoughtMetadata.parse(FALLBACK_METADATA);
      }
      const parsed = safeJsonParse(text);
      if (parsed === undefined) {
        return ThoughtMetadata.parse(FALLBACK_METADATA);
      }
      const validated = ThoughtMetadata.safeParse(parsed);
      if (!validated.success) {
        return ThoughtMetadata.parse(FALLBACK_METADATA);
      }
      return validated.data;
    } catch {
      return ThoughtMetadata.parse(FALLBACK_METADATA);
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
