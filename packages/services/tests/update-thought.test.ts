import { describe, expect, test } from "bun:test";
import { updateThought } from "../src/update-thought";
import { emptyMetadata, makeFakeDeps } from "./helpers/fakes";

describe("updateThought service", () => {
  test("re-fingerprints, re-embeds, posts the update, and re-upserts the vector", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_1",
      userId: "user_a",
      content: "original",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });

    const out = await updateThought({ convex, vectorize, embeddings }, "user_a", {
      thoughtId: "t_1",
      content: "rewritten content",
    });

    const outId: string = out.thoughtId;
    expect(outId).toBe("t_1");
    expect(out.reEmbedded).toBe(true);
    expect(convex.updateCalls).toHaveLength(1);
    expect(convex.updateCalls[0]?.content).toBe("rewritten content");
    expect(convex.updateCalls[0]?.userId).toBe("user_a");
    // Vectorize.upsert should run with namespace=userId
    expect(binding.upsertCalls).toHaveLength(1);
    expect(binding.upsertCalls[0]?.namespace).toBe("user_a");
    expect(binding.upsertCalls[0]?.id).toBe("t_1");
  });

  test("rejects empty content", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      updateThought({ convex, vectorize, embeddings }, "user_a", {
        thoughtId: "t_1",
        content: "",
      }),
    ).rejects.toThrow();
  });

  test("rejects missing userId", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      updateThought({ convex, vectorize, embeddings }, "", {
        thoughtId: "t_1",
        content: "x",
      }),
    ).rejects.toThrow();
  });

  test("propagates not-found from convex when thought doesn't exist", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      updateThought({ convex, vectorize, embeddings }, "user_a", {
        thoughtId: "t_missing",
        content: "any",
      }),
    ).rejects.toThrow();
  });
});
