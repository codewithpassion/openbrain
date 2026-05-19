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
