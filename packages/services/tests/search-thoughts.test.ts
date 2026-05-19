import { describe, expect, test } from "bun:test";
import { searchThoughtsOutputSchema } from "@openbrains/shared";
import { searchThoughts } from "../src/search-thoughts";
import { emptyMetadata, makeFakeDeps } from "./helpers/fakes";

describe("searchThoughts service", () => {
  test("embeds query, queries vectorize with namespace=userId, hydrates from Convex", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_1",
      userId: "user_a",
      content: "alpha thought",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    binding.setMatches([{ id: "t_1", score: 0.87 }]);

    const out = await searchThoughts({ convex, vectorize, embeddings }, "user_a", {
      query: "alpha",
    });
    const parsed = searchThoughtsOutputSchema.parse(out);
    expect(parsed.results.length).toBe(1);
    expect(binding.queryCalls[0]?.namespace).toBe("user_a");
    expect(parsed.results[0]?.content).toBe("alpha thought");
    expect(parsed.results[0]?.score).toBeCloseTo(0.87);
  });

  test("filters out matches below threshold", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_1",
      userId: "user_a",
      content: "x",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    binding.setMatches([{ id: "t_1", score: 0.3 }]);
    const out = await searchThoughts({ convex, vectorize, embeddings }, "user_a", {
      query: "x",
      threshold: 0.5,
    });
    expect(out.results.length).toBe(0);
  });

  test("invalid input throws", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      searchThoughts({ convex, vectorize, embeddings }, "user_a", { query: "" }),
    ).rejects.toThrow();
  });

  test("missing userId throws", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      searchThoughts({ convex, vectorize, embeddings }, "", { query: "x" }),
    ).rejects.toThrow();
  });

  test("passes type and source filters to vectorize", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    binding.setMatches([]);
    await searchThoughts({ convex, vectorize, embeddings }, "user_a", {
      query: "x",
      type: "task",
      source: "cli",
    });
    expect(binding.queryCalls[0]?.filter).toEqual({ type: "task", source: "cli" });
  });
});
