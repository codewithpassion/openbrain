import { contentFingerprint } from "@openbrains/ingest";
import {
  type MemoryWritebackInput,
  type MemoryWritebackOutput,
  memoryWritebackInputSchema,
  ThoughtId,
  ThoughtMetadata,
  type ThoughtMetadata as ThoughtMetadataT,
} from "@openbrains/shared";
import type { ConvexWritebackProvenance, ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

export async function memoryWriteback(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<MemoryWritebackOutput> {
  assertUserId(userId);
  const input: MemoryWritebackInput = parseInput(memoryWritebackInputSchema, rawInput);
  const { content, source, origin, trustGrade, scopes, agent, agentVersion, sessionId, sourceRef } =
    input;
  const fingerprint = await contentFingerprint(content);
  const embedding = await deps.embeddings.embed(content);
  const metadata: ThoughtMetadataT = ThoughtMetadata.parse({});

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
  // `sourceRef` is captured at the input schema but not yet on the writeback
  // HTTP endpoint. Echoed back to the caller via metadata only.
  void sourceRef;

  const { thoughtId } = await deps.convex.memoryWriteback({
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
  await deps.vectorize.upsert({
    id: thoughtId,
    userId,
    values: embedding.vector,
    metadata: { source },
  });
  return { thoughtId: ThoughtId.parse(thoughtId), trustGrade };
}
