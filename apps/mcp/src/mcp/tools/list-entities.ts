import { listEntitiesInputSchema } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Lists entities for the authenticated user. Filter pushdown via POST
 * /api/entities/list. Returns the minimal client-friendly projection.
 */
export async function listEntitiesHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = listEntitiesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { kind, limit } = parsed.data;
  const rows = await envelope.deps.convex.listEntities({
    userId: envelope.auth.userId,
    ...(kind === undefined ? {} : { kind }),
    limit,
  });
  return ok({
    entities: rows.map((r) => ({
      id: r._id,
      kind: r.kind,
      canonicalName: r.canonicalName,
      aliases: r.aliases,
      updatedAt: r.updatedAt,
    })),
  });
}
