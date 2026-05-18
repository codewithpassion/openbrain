import { listThoughtsInputSchema, ThoughtId, type ThoughtType } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Lists thoughts for the authenticated user. Filters (`days`, `type`, `topic`,
 * `person`, `limit`) push down to Convex via `POST /api/thoughts/list`.
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
  const rows = await envelope.deps.convex.listThoughts({
    userId,
    limit,
    ...(type === undefined ? {} : { type }),
    ...(topic === undefined ? {} : { topic }),
    ...(person === undefined ? {} : { person }),
    ...(days === undefined ? {} : { days }),
  });

  const trimmed = rows.map((row) => {
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
