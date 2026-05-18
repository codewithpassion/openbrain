import { memoryRecallInputSchema, ThoughtId } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Recalls memory by semantic similarity. Embeds the query, asks Vectorize
 * for the top-K ids in the user's namespace, then asks Convex to hydrate
 * each id with its thought row + latest provenance + use-policy in one call.
 * The recall trace is written by the Convex side (no separate client call).
 *
 * Origin/trustGrade defaults match ARCHITECTURE.md §"Agent Memory sidecars":
 * absence of a provenance row implies a human capture; absence of a
 * use-policy row defaults to `"evidence"`.
 */
export async function memoryRecallHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = memoryRecallInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { query, limit, threshold } = parsed.data;
  const userId = envelope.auth.userId;
  const embedding = await envelope.deps.embeddings.embed(query);
  const matches = await envelope.deps.vectorize.query({
    userId,
    values: embedding.vector,
    topK: limit,
  });
  const filtered = matches.filter((m) => m.score >= threshold);
  if (filtered.length === 0) {
    return ok({ results: [] });
  }
  const { items } = await envelope.deps.convex.memoryRecall({
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
  return ok({ results });
}
