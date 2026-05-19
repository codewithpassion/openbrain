import type { FetchLike } from "../metadata/openrouter";
import type {
  EntityExtractor,
  ExtractedEntity,
  ExtractedRelation,
  ExtractionResult,
} from "./types";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

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

interface ORChoice {
  readonly message?: { readonly content?: string };
}
interface ORResponse {
  readonly choices?: readonly ORChoice[];
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

export function createOpenRouterEntityExtractor(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: FetchLike;
}): EntityExtractor {
  const apiKey = opts.apiKey;
  const model = opts.model ?? DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = opts.fetch ?? fetch;

  async function extract(content: string): Promise<ExtractionResult> {
    if (content.trim().length === 0) {
      return { entities: [], relations: [] };
    }
    try {
      const res = await doFetch(`${baseUrl}/chat/completions`, {
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
      if (!res.ok) {
        return { entities: [], relations: [] };
      }
      const body = (await res.json()) as ORResponse;
      const text = body.choices?.[0]?.message?.content;
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
