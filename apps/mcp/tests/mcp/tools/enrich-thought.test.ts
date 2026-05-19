import { describe, expect, test } from "bun:test";
import {
  createFakeBrainDumpSplitter,
  createFakeEmbedder,
  type MetadataExtractor,
} from "@openbrains/ingest";
import { enrichThoughtOutputSchema, type ThoughtMetadata } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { enrichThoughtHandler } from "../../../src/mcp/tools/enrich-thought";
import { makeAuthContext } from "../../helpers/auth";
import { emptyMetadata, makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function programmableExtractor(metadata: ThoughtMetadata): MetadataExtractor {
  return { extract: () => Promise.resolve(metadata) };
}

function setup(userId: string, metadata: MetadataExtractor) {
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
        splitter: createFakeBrainDumpSplitter(),
      },
      auth: makeAuthContext(userId),
    },
    convex,
  };
}

describe("enrich-thought tool", () => {
  test("returns the LLM-inferred metadata for the user's thought", async () => {
    const rich: ThoughtMetadata = {
      type: "idea",
      topics: ["graphs"],
      people: ["Ada"],
      action_items: ["draft the design doc"],
      dates_mentioned: [],
    };
    const { envelope, convex } = setup("u", programmableExtractor(rich));
    convex.seedThought({
      _id: "t_1",
      userId: "u",
      content: "graph idea note with Ada",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    const result = await enrichThoughtHandler({ thoughtId: "t_1" }, envelope);
    const out = enrichThoughtOutputSchema.parse(result.structuredContent);
    expect(out.metadata.topics).toEqual(["graphs"]);
    expect(out.metadata.people).toEqual(["Ada"]);
    expect(out.metadata.type).toBe("idea");
  });

  test("returns isError when thought not found", async () => {
    const { envelope } = setup("u", programmableExtractor(emptyMetadata()));
    const result = await enrichThoughtHandler({ thoughtId: "t_missing" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("", programmableExtractor(emptyMetadata()));
    const result = await enrichThoughtHandler({ thoughtId: "t_1" }, envelope);
    expect(result.isError).toBe(true);
  });
});
