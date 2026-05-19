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
  /**
   * Cloudflare `AI` binding. Typed structurally as the embedding shape; the
   * chat-completion path narrows via `asChatAi(env.AI)` in `mcp/handler.ts`.
   * The real binding satisfies both at runtime.
   */
  AI: WorkersAiBinding;
  VECTORIZE: VectorizeBinding;
  OAUTH_KV: KVNamespace;
  CONVEX_URL: string;
  CLERK_DOMAIN: string;
  EMBEDDING_MODEL?: string;
  // Optional — when set, enables LLM-backed tools (classify/enrich/pan).
  OPENROUTER_API_KEY?: string;
  // Secrets — set via `wrangler secret put`, never committed.
  CLERK_JWKS_URL: string;
  CLERK_CLIENT_ID: string;
  CLERK_CLIENT_SECRET: string;
  INTERNAL_API_SECRET: string;
  /**
   * Shared HMAC secret used to sign device-flow bearer tokens AND the
   * short-lived approval-page session cookie. 32+ random bytes.
   */
  DEVICE_FLOW_SECRET: string;
}
