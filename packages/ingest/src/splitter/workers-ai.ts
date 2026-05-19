import { ThoughtType } from "@openbrains/shared";
import { z } from "zod";
import type { BrainDumpIdea, BrainDumpSplitter } from "./types";

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

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

interface WorkersAiChatBinding {
  run(
    model: string,
    input: {
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
      readonly response_format?: { readonly type: "json_object" };
    },
  ): Promise<{ readonly response?: string }>;
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

export function createWorkersAiBrainDumpSplitter(opts: {
  ai: WorkersAiChatBinding;
  model?: string;
  fallback?: BrainDumpSplitter;
}): BrainDumpSplitter {
  const ai = opts.ai;
  const model = opts.model ?? DEFAULT_MODEL;
  const fallback = opts.fallback;

  function onFailure(content: string, maxIdeas: number): Promise<readonly BrainDumpIdea[]> {
    if (fallback) {
      return fallback.split(content, maxIdeas);
    }
    return Promise.resolve([{ content, topics: [] }]);
  }

  async function split(content: string, maxIdeas: number): Promise<readonly BrainDumpIdea[]> {
    try {
      const result = await ai.run(model, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Max ideas: ${maxIdeas.toString()}\n\n${content}` },
        ],
        response_format: { type: "json_object" },
      });
      const text = result.response;
      if (typeof text !== "string") {
        return onFailure(content, maxIdeas);
      }
      const parsedJson = safeJsonParse(text);
      if (parsedJson === undefined) {
        return onFailure(content, maxIdeas);
      }
      const validated = ResponseSchema.safeParse(parsedJson);
      if (!validated.success) {
        return onFailure(content, maxIdeas);
      }
      return validated.data.ideas.slice(0, maxIdeas).map((i) => ({
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
