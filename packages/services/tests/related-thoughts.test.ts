import { describe, expect, test } from "bun:test";
import { relatedThoughtsOutputSchema } from "@openbrains/shared";
import { relatedThoughts } from "../src/related-thoughts";
import { emptyMetadata, makeFakeDeps } from "./helpers/fakes";

describe("relatedThoughts service", () => {
  test("re-embeds the source thought, queries Vectorize, excludes self, returns hydrated matches", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_source",
      userId: "user_a",
      content: "remember the milk",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    convex.seedThought({
      _id: "t_other",
      userId: "user_a",
      content: "milk and bread shopping list",
      source: "dashboard",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "b".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1_700_000_000_500,
      updatedAt: 1_700_000_000_500,
    });
    // Vectorize returns both, including the source thought itself — we expect it filtered.
    binding.setMatches([
      { id: "t_source", score: 0.99 },
      { id: "t_other", score: 0.92 },
    ]);

    const out = await relatedThoughts({ convex, vectorize, embeddings }, "user_a", {
      thoughtId: "t_source",
    });
    const parsed = relatedThoughtsOutputSchema.parse(out);
    expect(parsed.results).toHaveLength(1);
    const firstId: string = parsed.results[0]?.id ?? "";
    expect(firstId).toBe("t_other");
    expect(parsed.results[0]?.score).toBeCloseTo(0.92);
    expect(binding.queryCalls[0]?.namespace).toBe("user_a");
  });

  test("respects the threshold parameter", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_source",
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
    convex.seedThought({
      _id: "t_low",
      userId: "user_a",
      content: "y",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "b".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 2,
      updatedAt: 2,
    });
    binding.setMatches([{ id: "t_low", score: 0.5 }]);
    const out = await relatedThoughts({ convex, vectorize, embeddings }, "user_a", {
      thoughtId: "t_source",
      threshold: 0.8,
    });
    expect(out.results).toHaveLength(0);
  });

  test("returns empty when the source thought is missing or other-tenant", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    const out = await relatedThoughts({ convex, vectorize, embeddings }, "user_a", {
      thoughtId: "t_does_not_exist",
    });
    expect(out.results).toHaveLength(0);
  });

  test("missing userId throws", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      relatedThoughts({ convex, vectorize, embeddings }, "", { thoughtId: "t_x" }),
    ).rejects.toThrow();
  });
});
