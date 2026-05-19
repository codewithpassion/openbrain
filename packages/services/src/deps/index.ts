export * from "./convex";
export * from "./convex-schemas";
export * from "./embeddings";
export * from "./vectorize";

import type { ConvexClient } from "./convex";
import type { EmbeddingAdapter } from "./embeddings";
import type { VectorizeClient } from "./vectorize";

/**
 * The dependency bundle every service function accepts. Both `apps/mcp` and
 * `apps/dashboard` construct this from their own runtime bindings (Workers AI,
 * Vectorize, Convex HTTP), then call services with `(deps, userId, input)`.
 */
export interface ServiceDeps {
  convex: ConvexClient;
  vectorize: VectorizeClient;
  embeddings: EmbeddingAdapter;
}
