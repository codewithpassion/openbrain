import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { memoryRecallOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { memoryRecallHandler } from "../../../src/mcp/tools/memory-recall";
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

describe("memory-recall tool", () => {
  test("returns thoughts with default trustGrade=evidence and origin=human", async () => {
    const { envelope, convex, binding } = setup("user_a");
    convex.seedThought({
      _id: "t_1",
      userId: "user_a",
      content: "remembered",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    binding.setMatches([{ id: "t_1", score: 0.9 }]);
    const result = await memoryRecallHandler({ query: "x" }, envelope);
    const out = memoryRecallOutputSchema.parse(result.structuredContent);
    expect(out.results.length).toBe(1);
    expect(out.results[0]?.trustGrade).toBe("evidence");
    expect(out.results[0]?.origin).toBe("human");
  });

  test("respects threshold", async () => {
    const { envelope, convex, binding } = setup("u");
    convex.seedThought({
      _id: "t_1",
      userId: "u",
      content: "x",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    binding.setMatches([{ id: "t_1", score: 0.2 }]);
    const result = await memoryRecallHandler({ query: "x", threshold: 0.5 }, envelope);
    const out = memoryRecallOutputSchema.parse(result.structuredContent);
    expect(out.results.length).toBe(0);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await memoryRecallHandler({ query: "x" }, envelope);
    expect(result.isError).toBe(true);
  });
});
