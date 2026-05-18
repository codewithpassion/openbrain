import { listThoughtsInputSchema, ThoughtId, type ThoughtType } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * DEVIATION: `GET /api/thoughts` only honors `limit` (see
 * packages/convex/convex/http.ts). `days`, `type`, `topic`, and `person`
 * filters are applied here in the Worker after fetch. Acceptable for v1;
 * pushdown to Convex is an open item.
 */
export async function listThoughtsHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = listThoughtsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { limit, days, type, topic, person } = parsed.data;
  const userId = envelope.auth.userId;
  // Over-fetch by 5x the requested limit so client-side filtering can still
  // satisfy the user's `limit` after `days`/`type`/etc filtering.
  const fetchLimit = Math.min(100, limit * 5);
  const rows = await envelope.deps.convex.listThoughts({ userId, limit: fetchLimit });

  const cutoff = days === undefined ? undefined : Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = rows.filter((row) => {
    if (cutoff !== undefined && row.createdAt < cutoff) {
      return false;
    }
    if (type !== undefined && row.metadata.type !== type) {
      return false;
    }
    if (topic !== undefined && !row.metadata.topics.includes(topic)) {
      return false;
    }
    if (person !== undefined && !row.metadata.people.includes(person)) {
      return false;
    }
    return true;
  });

  const trimmed = filtered.slice(0, limit).map((row) => {
    const out: {
      id: ThoughtId;
      content: string;
      source: string;
      createdAt: number;
      type?: ThoughtType;
    } = {
      id: ThoughtId.parse(row._id),
      content: row.content,
      source: row.source,
      createdAt: row.createdAt,
    };
    if (row.metadata.type !== undefined) {
      const allowed: readonly ThoughtType[] = [
        "observation",
        "task",
        "idea",
        "reference",
        "person_note",
      ];
      if ((allowed as readonly string[]).includes(row.metadata.type)) {
        out.type = row.metadata.type as ThoughtType;
      }
    }
    return out;
  });

  return ok({ thoughts: trimmed });
}
