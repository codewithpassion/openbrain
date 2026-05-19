import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { fetchOutputSchema, ThoughtId } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { fetchThoughtHandler } from "../../../src/mcp/tools/fetch-thought";
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

describe("fetch (ChatGPT-compat) tool", () => {
  test("returns the full thought for the authenticated user", async () => {
    const { envelope, convex } = setup("user_a");
    convex.seedThought({
      _id: "t_1",
      userId: "user_a",
      content: "the full content of a thought",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    const result = await fetchThoughtHandler({ id: ThoughtId.parse("t_1") }, envelope);
    const out = fetchOutputSchema.parse(result.structuredContent);
    const id: string = out.id;
    expect(id).toBe("t_1");
    expect(out.text).toBe("the full content of a thought");
    expect(out.url).toBe("openbrains://thoughts/t_1");
  });

  test("cross-tenant fetch is invisible: another user's row is not returned", async () => {
    const { envelope, convex } = setup("user_a");
    convex.seedThought({
      _id: "t_other",
      userId: "user_b",
      content: "secret",
      source: "cli",
      embeddingModel: "fake",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      createdAt: 1,
      updatedAt: 1,
    });
    const result = await fetchThoughtHandler({ id: ThoughtId.parse("t_other") }, envelope);
    expect(result.isError).toBe(true);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await fetchThoughtHandler({ id: ThoughtId.parse("t_1") }, envelope);
    expect(result.isError).toBe(true);
  });
});
