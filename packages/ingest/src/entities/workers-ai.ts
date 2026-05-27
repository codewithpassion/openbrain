import type {
  EntityExtractor,
  ExtractedEntity,
  ExtractedRelation,
  ExtractionResult,
} from "./types";

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

const SYSTEM_PROMPT = [
  "Extract named entities and relations from a single thought.",
  "Respond with one JSON object only, schema:",
  "{",
  '  "entities": [{ "canonicalName": string, "kind": "person"|"org"|"topic"|"place"|"product"|"other", "aliases": string[] }],',
  '  "relations": [{ "fromCanonicalName": string, "toCanonicalName": string, "kind": "works_at"|"based_in"|"mentions"|"related_to"|"other", "confidence": number }]',
  "}",
  'Use canonical, capitalized names (e.g. "Cloudflare", not "cloudflare" or "CF"). Keep aliases verbatim from the source.',
  'If there are no entities, return { "entities": [], "relations": [] }. Confidence is 0..1.',
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

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function parseEntities(raw: unknown): ExtractedEntity[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ExtractedEntity[] = [];
  for (const item of raw) {
    if (!isObject(item)) {
      continue;
    }
    const name = item["canonicalName"];
    const kind = item["kind"];
    if (typeof name !== "string" || name.length === 0 || typeof kind !== "string") {
      continue;
    }
    const aliasesRaw = item["aliases"];
    const aliases: string[] = Array.isArray(aliasesRaw)
      ? aliasesRaw.filter((a): a is string => typeof a === "string")
      : [];
    out.push({ canonicalName: name, kind, aliases });
  }
  return out;
}

function parseRelations(raw: unknown): ExtractedRelation[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ExtractedRelation[] = [];
  for (const item of raw) {
    if (!isObject(item)) {
      continue;
    }
    const from = item["fromCanonicalName"];
    const to = item["toCanonicalName"];
    const kind = item["kind"];
    if (typeof from !== "string" || typeof to !== "string" || typeof kind !== "string") {
      continue;
    }
    const confRaw = item["confidence"];
    const confidence = typeof confRaw === "number" && confRaw >= 0 && confRaw <= 1 ? confRaw : 0.5;
    out.push({ fromCanonicalName: from, toCanonicalName: to, kind, confidence });
  }
  return out;
}

export function createWorkersAiEntityExtractor(opts: {
  ai: WorkersAiChatBinding;
  model?: string;
}): EntityExtractor {
  const ai = opts.ai;
  const model = opts.model ?? DEFAULT_MODEL;

  async function extract(content: string): Promise<ExtractionResult> {
    if (content.trim().length === 0) {
      return { entities: [], relations: [] };
    }
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
        return { entities: [], relations: [] };
      }
      const parsed = safeJsonParse(text);
      if (!isObject(parsed)) {
        return { entities: [], relations: [] };
      }
      return {
        entities: parseEntities(parsed["entities"]),
        relations: parseRelations(parsed["relations"]),
      };
    } catch {
      return { entities: [], relations: [] };
    }
  }

  return { extract };
}
