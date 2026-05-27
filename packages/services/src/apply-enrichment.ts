import {
  type EnrichThoughtInput,
  enrichThoughtInputSchema,
  type ThoughtMetadata,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

export interface ApplyEnrichmentResult {
  readonly metadata: ThoughtMetadata;
  readonly applied: boolean;
}

/**
 * `enrich_thought_apply` — runs the LLM extractor and merges the result into
 * the thought's metadata via `thoughts.mergeMetadataInternal`. Merge is
 * union-for-arrays, fill-only for `type` (never overwrites existing values).
 */
export async function applyEnrichment(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<ApplyEnrichmentResult> {
  assertUserId(userId);
  const input: EnrichThoughtInput = parseInput(enrichThoughtInputSchema, rawInput);
  const rows = await deps.convex.getThoughtsByIds({
    userId,
    ids: [input.thoughtId],
  });
  const source = rows[0];
  if (source === undefined) {
    return {
      metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
      applied: false,
    };
  }
  if (deps.metadata === undefined) {
    throw new Error("apply-enrichment requires a metadata extractor");
  }
  const metadata = await deps.metadata.extract(source.content);
  await deps.convex.mergeThoughtMetadata({
    userId,
    thoughtId: input.thoughtId,
    metadata,
  });
  return { metadata, applied: true };
}
