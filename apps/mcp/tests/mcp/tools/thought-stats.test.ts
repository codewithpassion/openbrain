import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { thoughtStatsOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { thoughtStatsHandler } from "../../../src/mcp/tools/thought-stats";
import { makeAuthContext } from "../../helpers/auth";
import { makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function setup(userId: string) {
  const convex = makeFakeConvex();
  const vectorize = createVectorizeClient(makeFakeVectorize());
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: { deps: { convex, vectorize, embeddings }, auth: makeAuthContext(userId) },
    convex,
  };
}

describe("thought-stats tool", () => {
  test("returns the Convex stats payload with topPeople defaulted to []", async () => {
    const { envelope, convex } = setup("user_a");
    convex.seedStats("user_a", {
      total: 5,
      byType: { idea: 3, task: 2 },
      topTopics: [{ topic: "ai", count: 3 }],
      topPeople: [{ name: "alice", count: 2 }],
    });
    const result = await thoughtStatsHandler({}, envelope);
    const out = thoughtStatsOutputSchema.parse(result.structuredContent);
    expect(out.total).toBe(5);
    expect(out.byType).toEqual({ idea: 3, task: 2 });
    expect(out.topTopics).toEqual([{ topic: "ai", count: 3 }]);
    expect(out.topPeople).toEqual([{ person: "alice", count: 2 }]);
  });

  test("calls Convex with the authenticated userId", async () => {
    const { envelope, convex } = setup("user_z");
    await thoughtStatsHandler({}, envelope);
    expect(convex.statsCalls[0]?.userId).toBe("user_z");
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await thoughtStatsHandler({}, envelope);
    expect(result.isError).toBe(true);
  });
});
