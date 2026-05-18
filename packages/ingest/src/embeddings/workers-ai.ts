import { type EmbeddingAdapter, EmbeddingError, type EmbeddingResult } from "./types";

const DEFAULT_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_MAX_INPUT_TOKENS = 4096;
// Rough BPE heuristic: ~4 characters per token. We reject before calling the
// binding so callers can fall back / chunk without burning a Workers AI call.
const CHARS_PER_TOKEN = 4;

/**
 * Narrow ambient type for the Cloudflare Workers AI binding. We only declare
 * the surface we actually call, per CLAUDE.md §2 ("narrow ambient type"
 * pattern). The real binding has many more overloads; we don't want them.
 */
export interface WorkersAiBinding {
  run(
    model: string,
    input: { text: readonly string[] },
  ): Promise<{ data: readonly (readonly number[])[] }>;
}

export function createWorkersAiEmbedder(
  ai: WorkersAiBinding,
  opts?: { model?: string },
): EmbeddingAdapter {
  const model = opts?.model ?? DEFAULT_MODEL;
  const dimensions = DEFAULT_DIMENSIONS;
  const maxInputTokens = DEFAULT_MAX_INPUT_TOKENS;

  function assertWithinTokenBudget(content: string): void {
    const estimatedTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
    if (estimatedTokens > maxInputTokens) {
      throw new EmbeddingError(
        `content exceeds max input tokens (~${estimatedTokens.toString()} > ${maxInputTokens.toString()})`,
      );
    }
  }

  async function embed(content: string): Promise<EmbeddingResult> {
    assertWithinTokenBudget(content);
    const response = await ai.run(model, { text: [content] });
    const first = response.data[0];
    if (!first) {
      throw new EmbeddingError("workers ai returned no vectors");
    }
    if (first.length !== dimensions) {
      throw new EmbeddingError(
        `embedding dimension mismatch: expected ${dimensions.toString()}, got ${first.length.toString()}`,
      );
    }
    return { vector: first, dimensions, model };
  }

  function embedBatch(contents: readonly string[]): Promise<readonly EmbeddingResult[]> {
    return Promise.all(contents.map((c) => embed(c)));
  }

  return { model, dimensions, maxInputTokens, embed, embedBatch };
}
