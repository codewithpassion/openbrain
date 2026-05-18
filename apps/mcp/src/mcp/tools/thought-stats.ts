import { thoughtStatsInputSchema } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Returns thought stats for the authenticated user. Convex returns
 * `topPeople: { name, count }[]`; the MCP tool surface (per
 * `@openbrains/shared`) uses `{ person, count }`, so we map here.
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
    topPeople: stats.topPeople.map((p) => ({ person: p.name, count: p.count })),
  });
}
