import { ThoughtType } from "@openbrains/shared";
import { z } from "zod";
import type { BrainDumpIdea, BrainDumpSplitter } from "./types";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

const SYSTEM_PROMPT = [
  "You split a freeform 'brain dump' into discrete idea candidates.",
  "Respond with one JSON object: { ideas: [...] }, where each idea is:",
  "{",
  '  "content": string,                  // concise single-thought form',
  '  "type": "observation" | "task" | "idea" | "reference" | "person_note",',
  '  "topics": string[]                  // short topic tags',
  "}",
  "Return at most the number of ideas the caller asked for.",
  "If the dump contains only one coherent thought, return one idea.",
].join("\n");

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface OpenRouterChoice {
  readonly message?: { readonly content?: string };
}

interface OpenRouterResponse {
  readonly choices?: readonly OpenRouterChoice[];
}

const ResponseSchema = z.object({
  ideas: z.array(
    z.object({
      content: z.string().min(1),
      type: ThoughtType.optional(),
      topics: z.array(z.string().min(1)).default([]),
    }),
  ),
});

export function createOpenRouterBrainDumpSplitter(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  fallback?: BrainDumpSplitter;
}): BrainDumpSplitter {
  const apiKey = opts.apiKey;
  const model = opts.model ?? DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = opts.fetch ?? fetch;
  const fallback = opts.fallback;

  function onFailure(content: string, maxIdeas: number): Promise<readonly BrainDumpIdea[]> {
    if (fallback) {
      return fallback.split(content, maxIdeas);
    }
    return Promise.resolve([{ content, topics: [] }]);
  }

  async function split(content: string, maxIdeas: number): Promise<readonly BrainDumpIdea[]> {
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
            { role: "user", content: `Max ideas: ${maxIdeas.toString()}\n\n${content}` },
          ],
        }),
      });
      if (!response.ok) {
        return onFailure(content, maxIdeas);
      }
      const body = (await response.json()) as OpenRouterResponse;
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") {
        return onFailure(content, maxIdeas);
      }
      const parsedJson = safeJsonParse(text);
      if (parsedJson === undefined) {
        return onFailure(content, maxIdeas);
      }
      const result = ResponseSchema.safeParse(parsedJson);
      if (!result.success) {
        return onFailure(content, maxIdeas);
      }
      return result.data.ideas.slice(0, maxIdeas).map((i) => ({
        content: i.content,
        ...(i.type === undefined ? {} : { type: i.type }),
        topics: i.topics,
      }));
    } catch {
      return onFailure(content, maxIdeas);
    }
  }

  return { split };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
