import type { WorkersAiBinding } from "@openbrains/ingest";
import type { VectorizeBinding } from "@openbrains/services/deps";

export type { VectorizeBinding };

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
  /**
   * Shared HMAC secret used to sign device-flow bearer tokens AND the
   * short-lived approval-page session cookie. 32+ random bytes.
   */
  DEVICE_FLOW_SECRET: string;
}
