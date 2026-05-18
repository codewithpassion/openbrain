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

describe("memory/sourceRefs", () => {
  test("add records a source ref scoped to the owner and audits it", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.sourceRefs.add, {
      thoughtId,
      kind: "url",
      uri: "https://example.com/a",
    });
    const rows = await ctxA.query(api.memory.sourceRefs.list, { thoughtId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.uri).toBe("https://example.com/a");
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "sourceRefs.add")).toBe(true);
  });

  test("add rejects unauthenticated callers", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(api.memory.sourceRefs.add, { thoughtId, kind: "url", uri: "https://x" }),
    ).rejects.toThrow(ConvexError);
  });

  test("add refuses cross-tenant access", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t
        .withIdentity({ subject: TEST_USER_B })
        .mutation(api.memory.sourceRefs.add, { thoughtId, kind: "url", uri: "https://x" }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
