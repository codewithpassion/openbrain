import { describe, expect, test } from "bun:test";
import { listThoughts, ServiceAuthError } from "../src/index";
import { emptyMetadata, makeFakeDeps } from "./helpers/fakes";

describe("listThoughts service", () => {
  test("returns the user's thoughts and trims to id/content/source/createdAt", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: "t_1",
      userId: "user_a",
      content: "alpha",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: { ...emptyMetadata(), type: "task" },
      createdAt: 100,
      updatedAt: 100,
    });
    const out = await listThoughts({ convex, vectorize, embeddings }, "user_a", { limit: 5 });
    expect(out.thoughts.length).toBe(1);
    expect(out.thoughts[0]?.content).toBe("alpha");
    expect(out.thoughts[0]?.type).toBe("task");
  });

  test("missing userId throws ServiceAuthError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(listThoughts({ convex, vectorize, embeddings }, "", {})).rejects.toBeInstanceOf(
      ServiceAuthError,
    );
  });
});
