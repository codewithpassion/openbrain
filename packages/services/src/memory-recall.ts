import {
  type MemoryRecallInput,
  type MemoryRecallOutput,
  memoryRecallInputSchema,
  ThoughtId,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

export async function memoryRecall(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<MemoryRecallOutput> {
  assertUserId(userId);
  const input: MemoryRecallInput = parseInput(memoryRecallInputSchema, rawInput);
  const { query, limit, threshold } = input;
  const embedding = await deps.embeddings.embed(query);
  const matches = await deps.vectorize.query({
    userId,
    values: embedding.vector,
    topK: limit,
  });
  const filtered = matches.filter((m) => m.score >= threshold);
  if (filtered.length === 0) {
    return { results: [] };
  }
  const { items } = await deps.convex.memoryRecall({
    userId,
    thoughtIds: filtered.map((m) => m.id),
    query,
    scores: filtered.map((m) => m.score),
  });
  const scoreById = new Map(filtered.map((m) => [m.id, m.score] as const));
  const results = items.map((item) => {
    const score = scoreById.get(item.thought._id) ?? 0;
    return {
      id: ThoughtId.parse(item.thought._id),
      score,
      content: item.thought.content,
      trustGrade: item.usePolicy?.trustGrade ?? ("evidence" as const),
      origin: item.provenance?.origin ?? ("human" as const),
      createdAt: item.thought.createdAt,
    };
  });
  return { results };
}
