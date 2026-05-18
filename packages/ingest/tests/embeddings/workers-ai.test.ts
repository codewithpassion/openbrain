import { describe, expect, test } from "bun:test";
import { EmbeddingError } from "../../src/embeddings/types";
import { createWorkersAiEmbedder, type WorkersAiBinding } from "../../src/embeddings/workers-ai";

function makeBinding(vectorLength: number): {
  binding: WorkersAiBinding;
  calls: Array<{ model: string; text: readonly string[] }>;
} {
  const calls: Array<{ model: string; text: readonly string[] }> = [];
  const binding: WorkersAiBinding = {
    run: (model, input) => {
      calls.push({ model, text: input.text });
      const vector = Array.from({ length: vectorLength }, (_, i) => i / vectorLength);
      return Promise.resolve({ data: [vector] });
    },
  };
  return { binding, calls };
}

describe("createWorkersAiEmbedder", () => {
  test("uses the default qwen3 model and 1024 dimensions", () => {
    const { binding } = makeBinding(1024);
    const embedder = createWorkersAiEmbedder(binding);
    expect(embedder.model).toBe("@cf/qwen/qwen3-embedding-0.6b");
    expect(embedder.dimensions).toBe(1024);
    expect(embedder.maxInputTokens).toBe(4096);
  });

  test("embed returns the first vector from the binding response", async () => {
    const { binding, calls } = makeBinding(1024);
    const embedder = createWorkersAiEmbedder(binding);
    const result = await embedder.embed("hello world");
    expect(result.vector.length).toBe(1024);
    expect(result.dimensions).toBe(1024);
    expect(result.model).toBe("@cf/qwen/qwen3-embedding-0.6b");
    expect(calls.length).toBe(1);
    expect(calls[0]?.model).toBe("@cf/qwen/qwen3-embedding-0.6b");
    expect(calls[0]?.text).toEqual(["hello world"]);
  });

  test("throws EmbeddingError when the binding returns a wrong-length vector", async () => {
    const { binding } = makeBinding(768);
    const embedder = createWorkersAiEmbedder(binding);
    await expect(embedder.embed("hello")).rejects.toBeInstanceOf(EmbeddingError);
  });

  test("throws EmbeddingError when content exceeds maxInputTokens (chars/4 heuristic)", async () => {
    const { binding, calls } = makeBinding(1024);
    const embedder = createWorkersAiEmbedder(binding);
    // 4096 tokens * 4 chars/token = 16384 chars is the boundary; 16385 must reject.
    const overlongContent = "a".repeat(16_385);
    await expect(embedder.embed(overlongContent)).rejects.toBeInstanceOf(EmbeddingError);
    expect(calls.length).toBe(0);
  });

  test("respects a custom model option", () => {
    const { binding } = makeBinding(1024);
    const embedder = createWorkersAiEmbedder(binding, { model: "@cf/custom/x" });
    expect(embedder.model).toBe("@cf/custom/x");
  });

  test("embedBatch returns N results", async () => {
    const { binding } = makeBinding(1024);
    const embedder = createWorkersAiEmbedder(binding);
    const results = await embedder.embedBatch(["a", "b", "c"]);
    expect(results.length).toBe(3);
  });

  test("embed throws EmbeddingError when binding returns no vectors", async () => {
    const binding: WorkersAiBinding = {
      run: async () => Promise.resolve({ data: [] }),
    };
    const embedder = createWorkersAiEmbedder(binding);
    await expect(embedder.embed("hello")).rejects.toBeInstanceOf(EmbeddingError);
  });
});
