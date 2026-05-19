import {
  type SearchThoughtsInput,
  type SearchThoughtsOutput,
  searchThoughtsInputSchema,
  ThoughtId,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

export async function searchThoughts(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<SearchThoughtsOutput> {
  assertUserId(userId);
  const input: SearchThoughtsInput = parseInput(searchThoughtsInputSchema, rawInput);
  return await runSearch(deps, userId, input);
}

async function runSearch(
  deps: ServiceDeps,
  userId: string,
  input: SearchThoughtsInput,
): Promise<SearchThoughtsOutput> {
  const { query, limit, threshold, type, source } = input;
  const embedding = await deps.embeddings.embed(query);
  const filter: { type?: string; source?: string } = {};
  if (type !== undefined) {
    filter.type = type;
  }
  if (source !== undefined) {
    filter.source = source;
  }
  const matches = await deps.vectorize.query({
    userId,
    values: embedding.vector,
    topK: limit,
    ...(Object.keys(filter).length > 0 ? { metadata: filter } : {}),
  });
  const filtered = matches.filter((m) => m.score >= threshold);
  if (filtered.length === 0) {
    return { results: [] };
  }
  const rows = await deps.convex.getThoughtsByIds({
    userId,
    ids: filtered.map((m) => m.id),
  });
  const byId = new Map(rows.map((r) => [r._id, r] as const));
  const results = filtered
    .map((m) => {
      const row = byId.get(m.id);
      if (row === undefined) {
        return null;
      }
      return {
        id: ThoughtId.parse(row._id),
        score: m.score,
        content: row.content,
        source: row.source,
        createdAt: row.createdAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return { results };
}
