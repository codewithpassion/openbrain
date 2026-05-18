import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "../../src/embeddings/fake";

describe("createFakeEmbedder", () => {
  test("exposes the configured dimensions and model", () => {
    const embedder = createFakeEmbedder({ dimensions: 1024, model: "fake-1024" });
    expect(embedder.dimensions).toBe(1024);
    expect(embedder.model).toBe("fake-1024");
    expect(embedder.maxInputTokens).toBeGreaterThan(0);
  });

  test("defaults to 1024 dimensions for swap-compat with Workers AI", () => {
    const embedder = createFakeEmbedder({});
    expect(embedder.dimensions).toBe(1024);
  });

  test("embed returns a vector of the configured length", async () => {
    const embedder = createFakeEmbedder({ dimensions: 8 });
    const result = await embedder.embed("hello");
    expect(result.vector.length).toBe(8);
    expect(result.dimensions).toBe(8);
    expect(result.model).toBe(embedder.model);
  });

  test("embed is deterministic for the same input", async () => {
    const embedder = createFakeEmbedder({ dimensions: 16 });
    const a = await embedder.embed("same input");
    const b = await embedder.embed("same input");
    expect(a.vector).toEqual(b.vector);
  });

  test("embed produces different vectors for different inputs", async () => {
    const embedder = createFakeEmbedder({ dimensions: 16 });
    const a = await embedder.embed("alpha");
    const b = await embedder.embed("beta");
    expect(a.vector).not.toEqual(b.vector);
  });

  test("embedBatch returns one result per input", async () => {
    const embedder = createFakeEmbedder({ dimensions: 4 });
    const results = await embedder.embedBatch(["one", "two", "three"]);
    expect(results.length).toBe(3);
    expect(results[0]?.vector.length).toBe(4);
  });

  test("embedBatch matches embed for the same content", async () => {
    const embedder = createFakeEmbedder({ dimensions: 4 });
    const [batched] = await embedder.embedBatch(["solo"]);
    const single = await embedder.embed("solo");
    expect(batched?.vector).toEqual(single.vector);
  });
});
