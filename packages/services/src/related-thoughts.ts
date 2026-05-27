import {
  type RelatedThoughtsInput,
  type RelatedThoughtsOutput,
  relatedThoughtsInputSchema,
  ThoughtId,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

/**
 * Vector-similarity primitive: given a thought, find other thoughts in the
 * same tenant whose embeddings score above `threshold`. The source thought
 * itself is always filtered out of the response.
 *
 * Re-embeds the source content rather than reading the vector back from
 * Vectorize — keeps the binding interface narrow and matches how
 * `searchThoughts` works.
 *
 * Used by the upcoming duplicate-review feature and by the MCP
 * `related_thoughts` tool.
 */
export async function relatedThoughts(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<RelatedThoughtsOutput> {
  assertUserId(userId);
  const input: RelatedThoughtsInput = parseInput(relatedThoughtsInputSchema, rawInput);
  const sourceRows = await deps.convex.getThoughtsByIds({
    userId,
    ids: [input.thoughtId],
  });
  const source = sourceRows[0];
  if (source === undefined) {
    return { results: [] };
  }
  const embedding = await deps.embeddings.embed(source.content);
  // Ask Vectorize for `limit + 1` because the source thought is virtually
  // always its own nearest neighbour; we need a slot to drop it.
  const matches = await deps.vectorize.query({
    userId,
    values: embedding.vector,
    topK: input.limit + 1,
  });
  const filtered = matches
    .filter((m) => m.id !== input.thoughtId)
    .filter((m) => m.score >= input.threshold)
    .slice(0, input.limit);
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
