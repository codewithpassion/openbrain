import { describe, expect, test } from "bun:test";
import { ThoughtId } from "@openbrains/shared";
import { memoryRecall, ServiceAuthError } from "../src/index";
import { emptyMetadata, makeFakeDeps } from "./helpers/fakes";

describe("memoryRecall service", () => {
  test("defaults trustGrade='evidence' and origin='human' when sidecars absent", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_1",
      userId: "user_a",
      content: "alpha",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 100,
      updatedAt: 100,
    });
    binding.setMatches([{ id: "t_1", score: 0.9 }]);
    const out = await memoryRecall({ convex, vectorize, embeddings }, "user_a", { query: "x" });
    expect(out.results.length).toBe(1);
    expect(out.results[0]?.trustGrade).toBe("evidence");
    expect(out.results[0]?.origin).toBe("human");
  });

  test("filters below threshold", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    binding.setMatches([{ id: "t_1", score: 0.2 }]);
    const out = await memoryRecall({ convex, vectorize, embeddings }, "user_a", {
      query: "x",
      threshold: 0.5,
    });
    expect(out.results.length).toBe(0);
  });

  test("missing userId throws ServiceAuthError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      memoryRecall({ convex, vectorize, embeddings }, "", { query: "x" }),
    ).rejects.toBeInstanceOf(ServiceAuthError);
  });

  test("with scopeIndexReady, pushes scope filter and post-filters via Convex row", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_work",
      userId: "user_a",
      content: "work",
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
      _id: "t_other",
      userId: "user_a",
      content: "other",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "o".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 2,
      updatedAt: 2,
    });
    binding.setMatches([
      { id: "t_work", score: 0.9 },
      { id: "t_other", score: 0.85 },
    ]);
    const out = await memoryRecall(
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
    expect(out.results.map((r) => r.id)).toEqual([ThoughtId.parse("t_work")]);
  });

  test("without scopeIndexReady, over-fetches and post-filters via Convex row only", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_work",
      userId: "user_a",
      content: "work",
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
      _id: "t_other",
      userId: "user_a",
      content: "other",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "o".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 2,
      updatedAt: 2,
    });
    binding.setMatches([
      { id: "t_work", score: 0.9 },
      { id: "t_other", score: 0.85 },
    ]);
    const out = await memoryRecall({ convex, vectorize, embeddings }, "user_a", {
      query: "x",
      scope: "work",
    });
    expect(binding.queryCalls[0]?.filter).toBeUndefined();
    expect(binding.queryCalls[0]?.topK).toBeGreaterThan(10);
    expect(out.results.map((r) => r.id)).toEqual([ThoughtId.parse("t_work")]);
  });
});
