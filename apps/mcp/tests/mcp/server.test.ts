import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { createVectorizeClient } from "../../src/deps/vectorize";
import { buildServer, TOOL_NAMES } from "../../src/mcp/server";
import { makeAuthContext } from "../helpers/auth";
import { defaultExtras, makeFakeConvex, makeFakeVectorize } from "../helpers/fakes";

describe("buildServer", () => {
  test("registers all v1 tools plus Phase C/E extensions", () => {
    const server = buildServer({
      deps: {
        convex: makeFakeConvex(),
        vectorize: createVectorizeClient(makeFakeVectorize()),
        embeddings: createFakeEmbedder({ dimensions: 1024 }),
        ...defaultExtras(),
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
      "list_entities",
      "get_entity",
      "entity_relations",
      "classify_thought",
      "enrich_thought",
      "pan_brain_dump",
      "related_thoughts",
      "update_thought",
      "classify_thought_apply",
      "enrich_thought_apply",
      "pan_brain_dump_apply",
      "list_projects",
      "create_project",
      "set_session_scope",
      "get_session_scope",
    ]);
  });
});
