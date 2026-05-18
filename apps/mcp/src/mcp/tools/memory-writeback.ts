import { contentFingerprint } from "@openbrains/ingest";
import { memoryWritebackInputSchema, ThoughtId, ThoughtMetadata } from "@openbrains/shared";
import type { ConvexWritebackProvenance } from "../../deps/convex";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Stores an agent-inferred memory. Per CLAUDE.md §7 and ARCHITECTURE.md
 * memory_use_policy, the writeback path:
 *   - always writes `trustGrade: "evidence"` on the Convex side (the HTTP
 *     endpoint has no `trustGrade` arg — any client-supplied value is ignored)
 *   - intentionally rejects `"instruction"` at the tool input boundary —
 *     only `memory_review` may promote
 *
 * The `trustGrade` echoed back to the caller reflects what *would* have been
 * applied (default `"evidence"`, or `"draft"` if the caller explicitly asks).
 * The actual policy row is always written at `"evidence"`.
 */
export async function memoryWritebackHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = memoryWritebackInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { content, source, origin, trustGrade, scopes, agent, agentVersion, sessionId, sourceRef } =
    parsed.data;
  const userId = envelope.auth.userId;
  const fingerprint = await contentFingerprint(content);
  const embedding = await envelope.deps.embeddings.embed(content);
  const metadata: ThoughtMetadata = ThoughtMetadata.parse({});

  const provenance: ConvexWritebackProvenance = { origin };
  if (agent !== undefined) {
    provenance.agent = agent;
  }
  if (agentVersion !== undefined) {
    provenance.agentVersion = agentVersion;
  }
  if (sessionId !== undefined) {
    provenance.sessionId = sessionId;
  }
  // `sourceRef` is captured at the input schema but the writeback HTTP
  // endpoint doesn't yet accept a source-ref row. Surface ref in echoed
  // metadata only; persistence is tracked separately.
  void sourceRef;

  const { thoughtId } = await envelope.deps.convex.memoryWriteback({
    userId,
    content,
    source,
    embeddingModel: embedding.model,
    embeddingDims: embedding.dimensions,
    fingerprint,
    metadata,
    provenance,
    scopes,
  });

  await envelope.deps.vectorize.upsert({
    id: thoughtId,
    userId,
    values: embedding.vector,
    metadata: { source },
  });

  return ok({ thoughtId: ThoughtId.parse(thoughtId), trustGrade });
}
