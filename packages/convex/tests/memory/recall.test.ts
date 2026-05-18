/**
 * Internal-only recall join. Asserts the internal mutation called by
 * `POST /api/memory/recall` joins thoughts ↔ provenance ↔ use-policy correctly
 * and writes recall traces atomically (single mutation transaction).
 */
import { describe, expect, test } from "bun:test";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { makeTest, TEST_USER_A, TEST_USER_B } from "../helpers/client";
import { makeThought } from "../helpers/fixtures";

async function seedThought(
  t: ReturnType<typeof makeTest>,
  userId: string,
): Promise<Id<"thoughts">> {
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

describe("memory/recall (internal)", () => {
  test("joins thought + latest provenance + use-policy", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const id = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId: id, scopes: ["personal"] });
    await ctxA.mutation(api.memory.provenance.record, { thoughtId: id, origin: "human" });

    const result = await t.mutation(internal.memory.recall.recallInternal, {
      userId: TEST_USER_A,
      thoughtIds: [id as Id<"thoughts">],
      query: "q",
      scores: [0.7],
      clientId: "mcp",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.thought._id).toBe(id);
    expect(result.items[0]?.provenance?.origin).toBe("human");
    expect(result.items[0]?.usePolicy?.trustGrade).toBe("evidence");
  });

  test("returns latest provenance when multiple exist", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const id = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.provenance.record, { thoughtId: id, origin: "human" });
    await ctxA.mutation(api.memory.provenance.record, {
      thoughtId: id,
      origin: "agent_inferred",
      agent: "claude",
    });

    const result = await t.mutation(internal.memory.recall.recallInternal, {
      userId: TEST_USER_A,
      thoughtIds: [id as Id<"thoughts">],
      query: "q",
      scores: [0.5],
      clientId: "mcp",
    });
    expect(result.items[0]?.provenance?.origin).toBe("agent_inferred");
  });

  test("silently drops cross-tenant ids", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    const result = await t.mutation(internal.memory.recall.recallInternal, {
      userId: TEST_USER_B,
      thoughtIds: [id as Id<"thoughts">],
      query: "q",
      scores: [0.9],
      clientId: "mcp",
    });
    expect(result.items).toEqual([]);
  });

  test("writes a recall trace per kept thought", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await t.mutation(internal.memory.recall.recallInternal, {
      userId: TEST_USER_A,
      thoughtIds: [id as Id<"thoughts">],
      query: "needle",
      scores: [0.42],
      clientId: "mcp",
    });
    const traces = await t.run((ctx) =>
      ctx.db
        .query("memory_recall_traces")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(traces).toHaveLength(1);
    expect(traces[0]?.query).toBe("needle");
    expect(traces[0]?.score).toBe(0.42);
    expect(traces[0]?.clientId).toBe("mcp");
  });
});
