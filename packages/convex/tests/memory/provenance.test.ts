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

describe("memory/provenance", () => {
  test("record stores provenance for an owned thought and audits it", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.provenance.record, {
      thoughtId,
      origin: "human",
    });
    const list = await ctxA.query(api.memory.provenance.list, { thoughtId });
    expect(list).toHaveLength(1);
    expect(list[0]?.origin).toBe("human");
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "provenance.record")).toBe(true);
  });

  test("record rejects unauthenticated callers", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(api.memory.provenance.record, { thoughtId, origin: "human" }),
    ).rejects.toThrow(ConvexError);
  });

  test("record refuses to attach to another tenant's thought", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t
        .withIdentity({ subject: TEST_USER_B })
        .mutation(api.memory.provenance.record, { thoughtId, origin: "human" }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("list refuses to read another tenant's thought provenance", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await t
      .withIdentity({ subject: TEST_USER_A })
      .mutation(api.memory.provenance.record, { thoughtId, origin: "human" });
    await expect(
      t.withIdentity({ subject: TEST_USER_B }).query(api.memory.provenance.list, { thoughtId }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
