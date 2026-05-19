import { describe, expect, test } from "bun:test";
import { ThoughtId } from "@openbrains/shared";
import { fetchThought, ServiceAuthError, ServiceNotFoundError } from "../src/index";
import { emptyMetadata, makeFakeDeps } from "./helpers/fakes";

const SEEDED_ID = ThoughtId.parse("t_1");

describe("fetchThought service", () => {
  test("returns the thought when present", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    convex.seedThought({
      _id: SEEDED_ID,
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
    const out = await fetchThought({ convex, vectorize, embeddings }, "user_a", { id: SEEDED_ID });
    expect(out.text).toBe("alpha");
    expect(out.title).toBe("alpha");
  });

  test("missing thought throws ServiceNotFoundError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      fetchThought({ convex, vectorize, embeddings }, "user_a", { id: ThoughtId.parse("t_404") }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  test("missing userId throws ServiceAuthError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      fetchThought({ convex, vectorize, embeddings }, "", { id: SEEDED_ID }),
    ).rejects.toBeInstanceOf(ServiceAuthError);
  });
});
