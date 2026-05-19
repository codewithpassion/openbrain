import { entityRelationsInputSchema } from "@openbrains/shared";
import type { ConvexEntityRelationRow } from "../../deps/convex";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

function project(r: ConvexEntityRelationRow): {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  kind: string;
  evidenceThoughtIds: readonly string[];
  confidence: number;
  updatedAt: number;
} {
  return {
    id: r._id,
    fromEntityId: r.fromEntityId,
    toEntityId: r.toEntityId,
    kind: r.kind,
    evidenceThoughtIds: r.evidenceThoughtIds,
    confidence: r.confidence,
    updatedAt: r.updatedAt,
  };
}

export async function entityRelationsHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = entityRelationsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { entityId, limit } = parsed.data;
  const { outgoing, incoming } = await envelope.deps.convex.entityRelations({
    userId: envelope.auth.userId,
    entityId,
    limit,
  });
  return ok({
    outgoing: outgoing.map(project),
    incoming: incoming.map(project),
  });
}
