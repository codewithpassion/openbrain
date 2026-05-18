import { describe, expect, test } from "bun:test";
import { createEmbedder } from "../../src/deps/embeddings";
import { makeFakeAi } from "../helpers/fakes";

describe("createEmbedder", () => {
  test("returns a 1024-dim qwen3 embedder by default", async () => {
    const ai = makeFakeAi();
    const embedder = createEmbedder(ai);
    expect(embedder.dimensions).toBe(1024);
    expect(embedder.model).toBe("@cf/qwen/qwen3-embedding-0.6b");
    const result = await embedder.embed("hi");
    expect(result.vector.length).toBe(1024);
    expect(ai.calls.length).toBe(1);
  });

  test("respects custom model via opts", () => {
    const ai = makeFakeAi();
    const embedder = createEmbedder(ai, { model: "@cf/custom/x" });
    expect(embedder.model).toBe("@cf/custom/x");
  });
});
