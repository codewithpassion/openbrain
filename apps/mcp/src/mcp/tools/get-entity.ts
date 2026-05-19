import { getEntityInputSchema } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Returns a single entity + recent mentions for the authenticated user. The
 * Convex side returns `entity: null` when the id isn't owned by the user,
 * so cross-tenant access is impossible by construction.
 */
export async function getEntityHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = getEntityInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { id, mentionsLimit } = parsed.data;
  const { entity, mentions } = await envelope.deps.convex.getEntity({
    userId: envelope.auth.userId,
    entityId: id,
    mentionsLimit,
  });
  return ok({
    entity:
      entity === null
        ? null
        : {
            id: entity._id,
            kind: entity.kind,
            canonicalName: entity.canonicalName,
            aliases: entity.aliases,
            updatedAt: entity.updatedAt,
          },
    mentions: mentions.map((m) => ({ thoughtId: m.thoughtId, createdAt: m.createdAt })),
  });
}
