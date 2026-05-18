import { memoryRecallInputSchema, ThoughtId } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * DEVIATION: `POST /api/memory/recall` does not currently join
 * `memory_provenance` / `memory_use_policy`. We default `trustGrade` to
 * "evidence" and `origin` to "human" per ARCHITECTURE.md §"Agent Memory
 * sidecars" (inferred/generated memory defaults to evidence; absence of a
 * provenance row implies a human capture). Open item: surface the joined
 * trust/origin from Convex.
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
  const rows = await envelope.deps.convex.getThoughtsByIds({
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
        trustGrade: "evidence" as const,
        origin: "human" as const,
        createdAt: row.createdAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return ok({ results });
}
