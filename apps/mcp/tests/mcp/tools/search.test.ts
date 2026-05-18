import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { searchOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { searchHandler } from "../../../src/mcp/tools/search";
import { makeAuthContext } from "../../helpers/auth";
import { emptyMetadata, makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function setup(userId: string) {
  const convex = makeFakeConvex();
  const binding = makeFakeVectorize();
  const vectorize = createVectorizeClient(binding);
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: { deps: { convex, vectorize, embeddings }, auth: makeAuthContext(userId) },
    convex,
    binding,
  };
}

describe("search (ChatGPT-compat) tool", () => {
  test("returns [{id,title,url}] for top matches", async () => {
    const { envelope, convex, binding } = setup("user_a");
    convex.seedThought({
      _id: "t_x",
      userId: "user_a",
      content: "Look at this idea about AI agents and persistent memory",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    binding.setMatches([{ id: "t_x", score: 0.92 }]);
    const result = await searchHandler({ query: "AI" }, envelope);
    const out = searchOutputSchema.parse(result.structuredContent);
    expect(out.results.length).toBe(1);
    const firstId: string | undefined = out.results[0]?.id;
    expect(firstId).toBe("t_x");
    expect(out.results[0]?.title.length).toBeGreaterThan(0);
    expect(out.results[0]?.url.startsWith("openbrains://")).toBe(true);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await searchHandler({ query: "x" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("invalid input → isError", async () => {
    const { envelope } = setup("u");
    const result = await searchHandler({ query: "" }, envelope);
    expect(result.isError).toBe(true);
  });
});
