import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "../helpers/client";
import { makeThought } from "../helpers/fixtures";

async function seedThought(t: ReturnType<typeof makeTest>, userId: string) {
  const fx = makeThought(userId);
  return await t.withIdentity({ subject: userId }).mutation(api.thoughts.createThought, {
    content: fx.content,
    source: fx.source,
    embeddingModel: fx.embeddingModel,
    embeddingDims: fx.embeddingDims,
    fingerprint: fx.fingerprint,
    metadata: fx.metadata,
  });
}

describe("memory/recallTraces", () => {
  test("record stores a recall trace for the caller", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.recallTraces.record, {
      thoughtId,
      query: "what did i think about X",
      score: 0.83,
      clientId: "claude-desktop",
    });
    const rows = await ctxA.query(api.memory.recallTraces.list, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.score).toBe(0.83);
  });

  test("record rejects unauthenticated callers", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(api.memory.recallTraces.record, {
        thoughtId,
        query: "x",
        score: 0.5,
        clientId: "c",
      }),
    ).rejects.toThrow(ConvexError);
  });

  test("record refuses cross-tenant access", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t.withIdentity({ subject: TEST_USER_B }).mutation(api.memory.recallTraces.record, {
        thoughtId,
        query: "x",
        score: 0.5,
        clientId: "c",
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("list returns only caller's traces", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const ctxB = t.withIdentity({ subject: TEST_USER_B });
    const aId = await seedThought(t, TEST_USER_A);
    const bId = await seedThought(t, TEST_USER_B);
    await ctxA.mutation(api.memory.recallTraces.record, {
      thoughtId: aId,
      query: "a",
      score: 0.5,
      clientId: "c",
    });
    await ctxB.mutation(api.memory.recallTraces.record, {
      thoughtId: bId,
      query: "b",
      score: 0.5,
      clientId: "c",
    });
    const aRows = await ctxA.query(api.memory.recallTraces.list, { limit: 10 });
    expect(aRows).toHaveLength(1);
    expect(aRows[0]?.query).toBe("a");
  });
});
