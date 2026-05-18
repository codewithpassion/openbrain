import { thoughtStatsInputSchema } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * DEVIATION: `GET /api/thoughts/stats` does not surface `topPeople`. We
 * default to `[]` here; pushing the aggregation into Convex is an open item.
 */
export async function thoughtStatsHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = thoughtStatsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const stats = await envelope.deps.convex.thoughtStats({ userId: envelope.auth.userId });
  return ok({
    total: stats.total,
    byType: stats.byType,
    topTopics: stats.topTopics,
    topPeople: [],
  });
}
