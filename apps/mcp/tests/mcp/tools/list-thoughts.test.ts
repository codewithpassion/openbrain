import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { listThoughtsOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { listThoughtsHandler } from "../../../src/mcp/tools/list-thoughts";
import { makeAuthContext } from "../../helpers/auth";
import {
  defaultExtras,
  emptyMetadata,
  makeFakeConvex,
  makeFakeVectorize,
} from "../../helpers/fakes";

function setup(userId: string) {
  const convex = makeFakeConvex();
  const vectorize = createVectorizeClient(makeFakeVectorize());
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: {
      deps: { convex, vectorize, embeddings, ...defaultExtras() },
      auth: makeAuthContext(userId),
    },
    convex,
  };
}

const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;

describe("list-thoughts tool", () => {
  test("returns recent thoughts for the authenticated userId", async () => {
    const { envelope, convex } = setup("user_z");
    convex.seedThought({
      _id: "t_1",
      userId: "user_z",
      content: "one",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: now,
      updatedAt: now,
    });
    convex.seedThought({
      _id: "t_2",
      userId: "user_other",
      content: "leaked",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "b".repeat(64),
      metadata: emptyMetadata(),
      createdAt: now,
      updatedAt: now,
    });
    const result = await listThoughtsHandler({}, envelope);
    const out = listThoughtsOutputSchema.parse(result.structuredContent);
    expect(out.thoughts.length).toBe(1);
    expect(out.thoughts[0]?.content).toBe("one");
  });

  test("filters by days client-side", async () => {
    const { envelope, convex } = setup("u");
    convex.seedThought({
      _id: "t_new",
      userId: "u",
      content: "fresh",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: now - 1 * dayMs,
      updatedAt: now - 1 * dayMs,
    });
    convex.seedThought({
      _id: "t_old",
      userId: "u",
      content: "stale",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "b".repeat(64),
      metadata: emptyMetadata(),
      createdAt: now - 30 * dayMs,
      updatedAt: now - 30 * dayMs,
    });
    const result = await listThoughtsHandler({ days: 7 }, envelope);
    const out = listThoughtsOutputSchema.parse(result.structuredContent);
    expect(out.thoughts.map((t) => t.content)).toEqual(["fresh"]);
  });

  test("invalid input → isError", async () => {
    const { envelope } = setup("u");
    const result = await listThoughtsHandler({ limit: -1 }, envelope);
    expect(result.isError).toBe(true);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await listThoughtsHandler({}, envelope);
    expect(result.isError).toBe(true);
  });
});
