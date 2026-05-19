import { describe, expect, test } from "bun:test";
import { ServiceAuthError, search } from "../src/index";
import { emptyMetadata, makeFakeDeps } from "./helpers/fakes";

describe("search (ChatGPT-compat) service", () => {
  test("returns [{id, title, url}] for top matches", async () => {
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
      createdAt: 100,
      updatedAt: 100,
    });
    binding.setMatches([{ id: "t_1", score: 0.9 }]);
    const out = await search({ convex, vectorize, embeddings }, "user_a", { query: "alpha" });
    expect(out.results.length).toBe(1);
    expect(out.results[0]?.title).toBe("alpha thought");
    expect(out.results[0]?.url).toBe("openbrains://thoughts/t_1");
  });

  test("missing userId throws ServiceAuthError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      search({ convex, vectorize, embeddings }, "", { query: "x" }),
    ).rejects.toBeInstanceOf(ServiceAuthError);
  });
});
