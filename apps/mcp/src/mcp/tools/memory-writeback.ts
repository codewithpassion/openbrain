import { contentFingerprint } from "@openbrains/ingest";
import { memoryWritebackInputSchema, ThoughtId, ThoughtMetadata } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Stores an agent-inferred memory. Per CLAUDE.md §7 and ARCHITECTURE.md
 * memory_use_policy, the writeback path:
 *   - defaults `trustGrade` to "evidence" (handled by the shared schema)
 *   - intentionally rejects "instruction" — only `memory_review` may promote
 *
 * DEVIATION: `/api/memory/writeback` doesn't accept `trustGrade` or `scopes`.
 * Those fields stay in the Worker until Convex grows the corresponding HTTP
 * surface to persist them on `memory_use_policy`. The returned trustGrade
 * reflects what we *would* have written.
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

  const wbInput = {
    userId,
    content,
    source,
    embeddingModel: embedding.model,
    embeddingDims: embedding.dimensions,
    fingerprint,
    metadata,
    origin,
    trustGrade,
    scopes,
    ...(agent === undefined ? {} : { agent }),
    ...(agentVersion === undefined ? {} : { agentVersion }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(sourceRef === undefined
      ? {}
      : {
          sourceRef:
            sourceRef.excerpt === undefined
              ? { kind: sourceRef.kind, uri: sourceRef.uri }
              : { kind: sourceRef.kind, uri: sourceRef.uri, excerpt: sourceRef.excerpt },
        }),
  };
  const { id } = await envelope.deps.convex.memoryWriteback(wbInput);

  await envelope.deps.vectorize.upsert({
    id,
    userId,
    values: embedding.vector,
    metadata: { source },
  });

  return ok({ thoughtId: ThoughtId.parse(id), trustGrade });
}
