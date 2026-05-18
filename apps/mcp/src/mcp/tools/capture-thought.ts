import { contentFingerprint } from "@openbrains/ingest";
import { captureThoughtInputSchema, ThoughtId, ThoughtMetadata } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function captureThoughtHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = captureThoughtInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { content, source } = parsed.data;
  const fingerprint = await contentFingerprint(content);
  const userId = envelope.auth.userId;

  // Idempotency gate. If the Convex side has already stored this fingerprint
  // for this user, return that id and skip embedding + Vectorize upsert.
  const existing = await envelope.deps.convex.getByFingerprint({ userId, fingerprint });
  if (existing !== null) {
    return ok({ thoughtId: ThoughtId.parse(existing.id), duplicate: true });
  }

  const embedding = await envelope.deps.embeddings.embed(content);
  const metadata: ThoughtMetadata = ThoughtMetadata.parse({});
  const { id } = await envelope.deps.convex.captureThought({
    userId,
    content,
    source,
    embeddingModel: embedding.model,
    embeddingDims: embedding.dimensions,
    fingerprint,
    metadata,
  });
  await envelope.deps.vectorize.upsert({
    id,
    userId,
    values: embedding.vector,
    metadata: { source },
  });
  return ok({ thoughtId: ThoughtId.parse(id), duplicate: false });
}
