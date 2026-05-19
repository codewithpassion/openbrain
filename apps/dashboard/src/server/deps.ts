/**
 * Server-side construction of the openbrains service-deps bundle. This file is
 * imported only from `createServerFn` handlers — never from the client — and
 * pulls the live Worker bindings (AI, Vectorize) plus the Convex HTTP secret
 * out of the Workers runtime via `cloudflare:workers`.
 *
 * The dashboard worker is a trusted server: it holds INTERNAL_API_SECRET, the
 * same secret the MCP worker uses, and dispatches Convex calls through the
 * `convex/http.ts` internal endpoints. Clerk userId attribution comes from
 * `auth()` in the calling server function, NOT from the request body.
 *
 * Required env / bindings (see apps/dashboard/wrangler.jsonc + .env.local):
 *   - AI               (binding)  — Workers AI for embeddings
 *   - VECTORIZE        (binding)  — Vectorize index "openbrain-thoughts-v1"
 *   - CONVEX_URL       (var)      — same value as VITE_CONVEX_URL
 *   - INTERNAL_API_SECRET (secret) — same value used by apps/mcp
 *   - EMBEDDING_MODEL  (optional) — defaults to @cf/qwen/qwen3-embedding-0.6b
 */
import { env } from "cloudflare:workers";
import {
  createConvexClient,
  createVectorizeClient,
  createWorkersAiEmbedder,
  type ServiceDeps,
  type VectorizeBinding,
  type WorkersAiBinding,
} from "@openbrains/services";

interface DashboardWorkerEnv {
  AI: WorkersAiBinding;
  VECTORIZE: VectorizeBinding;
  CONVEX_URL: string;
  INTERNAL_API_SECRET: string;
  EMBEDDING_MODEL?: string;
}

function getDashboardEnv(): DashboardWorkerEnv {
  const e = env as unknown as Partial<DashboardWorkerEnv>;
  if (e.AI === undefined) {
    throw new Error("dashboard worker missing AI binding");
  }
  if (e.VECTORIZE === undefined) {
    throw new Error("dashboard worker missing VECTORIZE binding");
  }
  if (e.CONVEX_URL === undefined || e.CONVEX_URL === "") {
    throw new Error("dashboard worker missing CONVEX_URL");
  }
  if (e.INTERNAL_API_SECRET === undefined || e.INTERNAL_API_SECRET === "") {
    throw new Error("dashboard worker missing INTERNAL_API_SECRET");
  }
  return {
    AI: e.AI,
    VECTORIZE: e.VECTORIZE,
    CONVEX_URL: e.CONVEX_URL,
    INTERNAL_API_SECRET: e.INTERNAL_API_SECRET,
    ...(e.EMBEDDING_MODEL === undefined ? {} : { EMBEDDING_MODEL: e.EMBEDDING_MODEL }),
  };
}

export function buildServiceDeps(): ServiceDeps {
  const e = getDashboardEnv();
  return {
    embeddings:
      e.EMBEDDING_MODEL === undefined
        ? createWorkersAiEmbedder(e.AI)
        : createWorkersAiEmbedder(e.AI, { model: e.EMBEDDING_MODEL }),
    vectorize: createVectorizeClient(e.VECTORIZE),
    convex: createConvexClient({
      convexUrl: e.CONVEX_URL,
      internalSecret: e.INTERNAL_API_SECRET,
    }),
  };
}
