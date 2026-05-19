import { describe, expect, test } from "bun:test";
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
});
