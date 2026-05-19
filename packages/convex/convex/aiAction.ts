/**
 * Convex → Workers AI bridge. The MCP Worker exposes
 * `POST /internal/ai/run`; this internal action wraps that call so other
 * Convex code (digests, entity extraction, future re-embed jobs) can ask for
 * embeddings without owning their own credential.
 *
 * Env vars (set via `convex env set`):
 *   MCP_WORKER_URL          — origin of the MCP Worker (no trailing slash)
 *   INTERNAL_API_SECRET     — shared secret matching the Worker
 *
 * Returns a structured outcome so callers don't have to wrap each call in
 * their own try/catch — missing env is `skipped`, network/HTTP failure is
 * `failure`.
 */
import { createWorkersAiEmbedder, createWorkersAiHttpClient } from "@openbrains/ingest";
import { v } from "convex/values";
import { internalAction } from "./_generated/server.js";

const DEFAULT_MODEL = "@cf/qwen/qwen3-embedding-0.6b";

export type EmbedOutcome =
  | { status: "skipped"; reason: string }
  | { status: "failure"; reason: string }
  | { status: "success"; vector: readonly number[]; dimensions: number; model: string };

export const embedInternal = internalAction({
  args: { content: v.string(), model: v.optional(v.string()) },
  handler: async (_ctx, args): Promise<EmbedOutcome> => {
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const baseUrl = process.env["MCP_WORKER_URL"];
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const secret = process.env["INTERNAL_API_SECRET"];
    if (baseUrl === undefined || baseUrl === "") {
      return { status: "skipped", reason: "MCP_WORKER_URL not set" };
    }
    if (secret === undefined || secret === "") {
      return { status: "skipped", reason: "INTERNAL_API_SECRET not set" };
    }
    const model = args.model ?? DEFAULT_MODEL;
    const ai = createWorkersAiHttpClient({ baseUrl, internalSecret: secret });
    const embedder = createWorkersAiEmbedder(ai, { model });
    try {
      const result = await embedder.embed(args.content);
      return {
        status: "success",
        vector: result.vector,
        dimensions: result.dimensions,
        model: result.model,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      return { status: "failure", reason: message };
    }
  },
});
