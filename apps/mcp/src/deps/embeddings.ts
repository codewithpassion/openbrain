import {
  createWorkersAiEmbedder,
  type EmbeddingAdapter,
  type WorkersAiBinding,
} from "@openbrains/ingest";

/**
 * Thin wrapper that produces the canonical Workers AI embedder for this
 * Worker. Kept separate so the MCP handler can swap to a fake in tests
 * without depending on the AI binding directly.
 */
export function createEmbedder(ai: WorkersAiBinding, opts?: { model?: string }): EmbeddingAdapter {
  return opts?.model === undefined
    ? createWorkersAiEmbedder(ai)
    : createWorkersAiEmbedder(ai, { model: opts.model });
}
