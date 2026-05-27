import { describe, expect, test } from "bun:test";
import { searchThoughtsOutputSchema, ThoughtId } from "@openbrains/shared";
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

  test("with scopeIndexReady, pushes scope filter down to vectorize and post-filters", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_work",
      userId: "user_a",
      content: "work thought",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "w".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
      scope: "work",
    });
    convex.seedThought({
      _id: "t_personal",
      userId: "user_a",
      content: "personal thought",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "p".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 2,
      updatedAt: 2,
    });
    // Simulate Vectorize-metadata-index lag: a row tagged 'personal' slips
    // through even with the scope filter; the Convex post-check must drop it.
    binding.setMatches([
      { id: "t_work", score: 0.9 },
      { id: "t_personal", score: 0.88 },
    ]);
    const out = await searchThoughts(
      {
        convex,
        vectorize,
        embeddings,
        featureFlags: { scopeIndexReady: true },
      },
      "user_a",
      { query: "x", scope: "work" },
    );
    expect(binding.queryCalls[0]?.filter).toEqual({ scope: "work" });
    expect(binding.queryCalls[0]?.topK).toBe(10);
    expect(out.results.map((r) => r.id)).toEqual([ThoughtId.parse("t_work")]);
  });

  test("without scopeIndexReady, over-fetches and post-filters via Convex row only", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_work",
      userId: "user_a",
      content: "work thought",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "w".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
      scope: "work",
    });
    convex.seedThought({
      _id: "t_personal",
      userId: "user_a",
      content: "personal thought",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "p".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 2,
      updatedAt: 2,
    });
    binding.setMatches([
      { id: "t_work", score: 0.9 },
      { id: "t_personal", score: 0.88 },
    ]);
    const out = await searchThoughts({ convex, vectorize, embeddings }, "user_a", {
      query: "x",
      scope: "work",
    });
    // No scope in the Vectorize filter — the over-fetch keeps the index call
    // safe even when the metadata index doesn't exist.
    expect(binding.queryCalls[0]?.filter).toBeUndefined();
    expect(binding.queryCalls[0]?.topK).toBeGreaterThan(10);
    expect(out.results.map((r) => r.id)).toEqual([ThoughtId.parse("t_work")]);
  });
});
