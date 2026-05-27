export * from "./convex";
export * from "./convex-schemas";
export * from "./embeddings";
export * from "./vectorize";

import type { BrainDumpSplitter, MetadataExtractor } from "@openbrains/ingest";
import type { ConvexClient } from "./convex";
import type { EmbeddingAdapter } from "./embeddings";
import type { VectorizeClient } from "./vectorize";

/**
 * The dependency bundle every service function accepts. Both `apps/mcp` and
 * `apps/dashboard` construct this from their own runtime bindings (Workers AI,
 * Vectorize, Convex HTTP), then call services with `(deps, userId, input)`.
 *
 * `metadata` and `splitter` are optional because most services don't need
 * them; the Phase E `apply-*` services that do will throw at the input
 * boundary if the host didn't wire one through.
 */
/**
 * Feature flags injected at the deps boundary. Today only one flag:
 *
 *   `scopeIndexReady` — Vectorize has a `scope` metadata index. When false,
 *   `searchThoughts`/`memoryRecall` skip the push-down filter (it would 400
 *   without the index) and over-fetch + post-filter via the Convex row. Set
 *   true after running:
 *     `wrangler vectorize create-metadata-index thoughts-v1 --property-name=scope --type=string`
 *
 *   This is deployment-ordering safety: the new behavior ships in code, the
 *   flag flips after the index is created in prod.
 */
export interface ServiceFeatureFlags {
  scopeIndexReady?: boolean;
}

export interface ServiceDeps {
  convex: ConvexClient;
  vectorize: VectorizeClient;
  embeddings: EmbeddingAdapter;
  metadata?: MetadataExtractor;
  splitter?: BrainDumpSplitter;
  featureFlags?: ServiceFeatureFlags;
}
