import type { WorkersAiBinding } from "@openbrains/ingest";

/**
 * Narrow Vectorize binding surface that we actually call. We declare a tiny
 * structural type rather than pulling the full `Vectorize` interface from
 * `@cloudflare/workers-types`; this keeps the shape testable with plain fakes
 * (per CLAUDE.md §2 "narrow ambient type" pattern).
 */
export interface VectorizeBinding {
  upsert(
    vectors: readonly {
      id: string;
      values: readonly number[];
      namespace: string;
      metadata?: Record<string, string>;
    }[],
  ): Promise<unknown>;
  query(
    values: readonly number[],
    options: {
      topK: number;
      namespace: string;
      filter?: Record<string, string>;
      returnValues?: boolean;
      returnMetadata?: boolean | "all" | "indexed";
    },
  ): Promise<{ matches: readonly { id: string; score: number }[] }>;
  deleteByIds(ids: readonly string[]): Promise<unknown>;
}

export interface WorkerEnv {
  AI: WorkersAiBinding;
  VECTORIZE: VectorizeBinding;
  OAUTH_KV: KVNamespace;
  CONVEX_URL: string;
  CLERK_DOMAIN: string;
  EMBEDDING_MODEL?: string;
  // Secrets — set via `wrangler secret put`, never committed.
  CLERK_JWKS_URL: string;
  CLERK_CLIENT_ID: string;
  CLERK_CLIENT_SECRET: string;
  INTERNAL_API_SECRET: string;
}
