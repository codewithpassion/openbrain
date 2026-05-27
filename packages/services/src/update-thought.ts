import { contentFingerprint } from "@openbrains/ingest";
import {
  ThoughtMetadata,
  type UpdateThoughtInput,
  type UpdateThoughtOutput,
  updateThoughtInputSchema,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

/**
 * Edit a thought's content. Re-fingerprints, re-embeds, updates Convex.
 * Vectorize is also re-upserted with the new vector so semantic search stays
 * consistent. Metadata is reset to the empty shape so the next Phase E pass
 * can re-derive it; the LLM-side re-enrichment is the caller's concern.
 *
 * Throws if:
 *   - userId is empty (ServiceAuthError)
 *   - input is invalid (ServiceInputError)
 *   - the new content's fingerprint collides with another thought owned by
 *     this user (Convex returns 409)
 */
export async function updateThought(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<UpdateThoughtOutput> {
  assertUserId(userId);
  const input: UpdateThoughtInput = parseInput(updateThoughtInputSchema, rawInput);
  const fingerprint = await contentFingerprint(input.content);
  const embedding = await deps.embeddings.embed(input.content);
  const metadata = ThoughtMetadata.parse({});
  await deps.convex.updateThought({
    userId,
    thoughtId: input.thoughtId,
    content: input.content,
    fingerprint,
    metadata,
    embeddingModel: embedding.model,
    embeddingDims: embedding.dimensions,
  });
  // The vectorize row id mirrors the thought id; re-upserting overwrites the
  // existing vector with the new embedding.
  await deps.vectorize.upsert({
    id: input.thoughtId,
    userId,
    values: embedding.vector,
    metadata: { source: "edit" },
  });
  return { thoughtId: input.thoughtId, reEmbedded: true };
}
