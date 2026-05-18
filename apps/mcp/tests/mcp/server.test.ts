import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { createVectorizeClient } from "../../src/deps/vectorize";
import { buildServer, TOOL_NAMES } from "../../src/mcp/server";
import { makeAuthContext } from "../helpers/auth";
import { makeFakeConvex, makeFakeVectorize } from "../helpers/fakes";

describe("buildServer", () => {
  test("registers all v1 tools", () => {
    const server = buildServer({
      deps: {
        convex: makeFakeConvex(),
        vectorize: createVectorizeClient(makeFakeVectorize()),
        embeddings: createFakeEmbedder({ dimensions: 1024 }),
      },
      auth: makeAuthContext("user_a"),
    });
    expect(server).toBeDefined();
    expect(TOOL_NAMES).toEqual([
      "capture_thought",
      "search_thoughts",
      "list_thoughts",
      "thought_stats",
      "search",
      "fetch",
      "memory_recall",
      "memory_writeback",
      "memory_review",
    ]);
  });
});
