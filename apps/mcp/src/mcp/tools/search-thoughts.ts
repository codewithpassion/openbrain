import { searchThoughtsInputSchema, ThoughtId } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function searchThoughtsHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = searchThoughtsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { query, limit, threshold, type, source } = parsed.data;
  const userId = envelope.auth.userId;
  const embedding = await envelope.deps.embeddings.embed(query);

  const filter: { type?: string; source?: string } = {};
  if (type !== undefined) {
    filter.type = type;
  }
  if (source !== undefined) {
    filter.source = source;
  }

  const matches = await envelope.deps.vectorize.query({
    userId,
    values: embedding.vector,
    topK: limit,
    ...(Object.keys(filter).length > 0 ? { metadata: filter } : {}),
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
        source: row.source,
        createdAt: row.createdAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return ok({ results });
}
