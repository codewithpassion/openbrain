import type { WorkersAiBinding } from "@openbrains/ingest";
import type { VectorizeBinding } from "@openbrains/services/deps";

export type { VectorizeBinding };

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
  /**
   * Set to "1" after the operator has created the Vectorize metadata index
   * for `scope`. When unset/0, scope-filtered searches fall back to
   * over-fetch + Convex post-filter — safe but slower.
   * See `packages/services/src/deps/index.ts › ServiceFeatureFlags`.
   */
  SCOPE_INDEX_READY?: string;
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
