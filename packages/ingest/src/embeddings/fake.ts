import type { EmbeddingAdapter, EmbeddingResult } from "./types";

const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_MODEL = "fake-embedder";
const DEFAULT_MAX_INPUT_TOKENS = 4096;

/**
 * Deterministic in-memory embedder for tests and local development.
 *
 * Algorithm: SHA-256 the input, use the first 4 bytes as a 32-bit seed for a
 * mulberry32 PRNG, then emit `dimensions` values in [-1, 1]. Same input
 * always produces the same vector.
 */
export function createFakeEmbedder(opts: {
  dimensions?: number;
  model?: string;
}): EmbeddingAdapter {
  const dimensions = opts.dimensions ?? DEFAULT_DIMENSIONS;
  const model = opts.model ?? DEFAULT_MODEL;
  const maxInputTokens = DEFAULT_MAX_INPUT_TOKENS;

  async function embed(content: string): Promise<EmbeddingResult> {
    const seed = await seedFromContent(content);
    const rng = mulberry32(seed);
    const vector = new Array<number>(dimensions);
    for (let i = 0; i < dimensions; i++) {
      vector[i] = rng() * 2 - 1;
    }
    return { vector, dimensions, model };
  }

  function embedBatch(contents: readonly string[]): Promise<readonly EmbeddingResult[]> {
    return Promise.all(contents.map((c) => embed(c)));
  }

  return { model, dimensions, maxInputTokens, embed, embedBatch };
}

async function seedFromContent(content: string): Promise<number> {
  const bytes = new TextEncoder().encode(content);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  // First 4 bytes → unsigned 32-bit seed.
  return (
    (((digest[0] ?? 0) << 24) |
      ((digest[1] ?? 0) << 16) |
      ((digest[2] ?? 0) << 8) |
      (digest[3] ?? 0)) >>>
    0
  );
}

/**
 * mulberry32 PRNG. 8 lines, deterministic, no deps.
 * Returns uniform values in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
