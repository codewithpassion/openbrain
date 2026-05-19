import { describe, expect, test } from "bun:test";
import {
  type BrainDumpSplitter,
  createFakeBrainDumpSplitter,
  createFakeEmbedder,
  type MetadataExtractor,
} from "@openbrains/ingest";
import { classifyThoughtOutputSchema, type ThoughtMetadata } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { classifyThoughtHandler } from "../../../src/mcp/tools/classify-thought";
import { makeAuthContext } from "../../helpers/auth";
import { emptyMetadata, makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function programmableExtractor(metadata: ThoughtMetadata): {
  extractor: MetadataExtractor;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    extractor: {
      extract: (content) => {
        calls.push(content);
        return Promise.resolve(metadata);
      },
    },
    calls,
  };
}

function setup(userId: string, metadata: MetadataExtractor, splitter?: BrainDumpSplitter) {
  const convex = makeFakeConvex();
  const vectorize = createVectorizeClient(makeFakeVectorize());
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: {
      deps: {
        convex,
        vectorize,
        embeddings,
        metadata,
        splitter: splitter ?? createFakeBrainDumpSplitter(),
      },
      auth: makeAuthContext(userId),
    },
    convex,
  };
}

describe("classify-thought tool", () => {
  test("returns the LLM-inferred type for the user's thought", async () => {
    const { extractor, calls } = programmableExtractor({
      ...emptyMetadata(),
      type: "task",
    });
    const { envelope, convex } = setup("u", extractor);
    convex.seedThought({
      _id: "t_1",
      userId: "u",
      content: "ship the docs",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    const result = await classifyThoughtHandler({ thoughtId: "t_1" }, envelope);
    const out = classifyThoughtOutputSchema.parse(result.structuredContent);
    expect(out.type).toBe("task");
    expect(calls).toEqual(["ship the docs"]);
  });

  test("falls back to 'observation' when extractor returns no type", async () => {
    const { extractor } = programmableExtractor(emptyMetadata());
    const { envelope, convex } = setup("u", extractor);
    convex.seedThought({
      _id: "t_1",
      userId: "u",
      content: "ambient note",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    const result = await classifyThoughtHandler({ thoughtId: "t_1" }, envelope);
    const out = classifyThoughtOutputSchema.parse(result.structuredContent);
    expect(out.type).toBe("observation");
  });

  test("returns isError when thought not owned by user", async () => {
    const { extractor } = programmableExtractor({ ...emptyMetadata(), type: "task" });
    const { envelope, convex } = setup("u", extractor);
    convex.seedThought({
      _id: "t_other",
      userId: "u_other",
      content: "x",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "b".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    const result = await classifyThoughtHandler({ thoughtId: "t_other" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("missing userId → isError", async () => {
    const { extractor } = programmableExtractor(emptyMetadata());
    const { envelope } = setup("", extractor);
    const result = await classifyThoughtHandler({ thoughtId: "t_1" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("invalid input → isError", async () => {
    const { extractor } = programmableExtractor(emptyMetadata());
    const { envelope } = setup("u", extractor);
    const result = await classifyThoughtHandler({}, envelope);
    expect(result.isError).toBe(true);
  });
});
