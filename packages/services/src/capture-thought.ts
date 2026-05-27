import { contentFingerprint } from "@openbrains/ingest";
import {
  type CaptureThoughtInput,
  captureThoughtInputSchema,
  ThoughtMetadata,
  type ThoughtMetadata as ThoughtMetadataT,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

export interface CaptureThoughtResult {
  readonly thoughtId: string;
  readonly duplicate: boolean;
}

export async function captureThought(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<CaptureThoughtResult> {
  assertUserId(userId);
  const input: CaptureThoughtInput = parseInput(captureThoughtInputSchema, rawInput);
  const fingerprint = await contentFingerprint(input.content);
  const scope = input.scope;
  const existing = await deps.convex.getByFingerprint({
    userId,
    fingerprint,
    ...(scope === undefined ? {} : { scope }),
  });
  if (existing !== null) {
    return { thoughtId: existing._id, duplicate: true };
  }
  const embedding = await deps.embeddings.embed(input.content);
  const metadata: ThoughtMetadataT = ThoughtMetadata.parse({});
  const { id } = await deps.convex.captureThought({
    userId,
    content: input.content,
    source: input.source,
    embeddingModel: embedding.model,
    embeddingDims: embedding.dimensions,
    fingerprint,
    metadata,
    ...(scope === undefined ? {} : { scope }),
  });
  // Vector metadata carries scope so a follow-up Vectorize metadata index +
  // filter call can scope semantic search. Post-filter via Convex covers the
  // gap until then (see memoryRecall).
  await deps.vectorize.upsert({
    id,
    userId,
    values: embedding.vector,
    metadata: {
      source: input.source,
      ...(scope === undefined ? {} : { scope }),
    },
  });
  return { thoughtId: id, duplicate: false };
}
