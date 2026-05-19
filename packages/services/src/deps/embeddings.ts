/**
 * Re-export of the embedding adapter from @openbrains/ingest. Services accept
 * any `EmbeddingAdapter`; the concrete Workers AI embedder lives in ingest so
 * non-Worker contexts (tests, CLI) can substitute a fake.
 */
export {
  createWorkersAiEmbedder,
  type EmbeddingAdapter,
  type WorkersAiBinding,
} from "@openbrains/ingest";
