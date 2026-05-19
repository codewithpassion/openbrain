import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { searchThoughtsOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { searchThoughtsHandler } from "../../../src/mcp/tools/search-thoughts";
import { makeAuthContext } from "../../helpers/auth";
import {
  defaultExtras,
  emptyMetadata,
  makeFakeConvex,
  makeFakeVectorize,
} from "../../helpers/fakes";

function setup(userId: string) {
  const convex = makeFakeConvex();
  const binding = makeFakeVectorize();
  const vectorize = createVectorizeClient(binding);
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: {
      deps: { convex, vectorize, embeddings, ...defaultExtras() },
      auth: makeAuthContext(userId),
    },
    convex,
    binding,
  };
}

describe("search-thoughts tool", () => {
  test("embeds query, queries vectorize with namespace=userId, then hydrates from Convex", async () => {
    const { envelope, convex, binding } = setup("user_a");
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

    const result = await searchThoughtsHandler({ query: "alpha" }, envelope);
    expect(result.isError).toBeUndefined();
    const out = searchThoughtsOutputSchema.parse(result.structuredContent);
    expect(out.results.length).toBe(1);
    expect(binding.queryCalls[0]?.namespace).toBe("user_a");
    expect(out.results[0]?.content).toBe("alpha thought");
    expect(out.results[0]?.score).toBeCloseTo(0.87);
  });

  test("filters out matches below threshold", async () => {
    const { envelope, convex, binding } = setup("user_a");
    convex.seedThought({
      _id: "t_1",
      userId: "user_a",
      content: "alpha",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    binding.setMatches([{ id: "t_1", score: 0.3 }]);
    const result = await searchThoughtsHandler({ query: "x", threshold: 0.5 }, envelope);
    const out = searchThoughtsOutputSchema.parse(result.structuredContent);
    expect(out.results.length).toBe(0);
  });

  test("invalid input → isError", async () => {
    const { envelope } = setup("u");
    const result = await searchThoughtsHandler({ query: "" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await searchThoughtsHandler({ query: "x" }, envelope);
    expect(result.isError).toBe(true);
  });
});
