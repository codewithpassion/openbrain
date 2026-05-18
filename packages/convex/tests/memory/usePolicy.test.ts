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

describe("memory/usePolicy", () => {
  test("upsert creates a policy with default trustGrade=evidence", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: ["personal"] });
    const got = await ctxA.query(api.memory.usePolicy.get, { thoughtId });
    expect(got?.trustGrade).toBe("evidence");
    expect(got?.scopes).toEqual(["personal"]);
  });

  test("upsert updates scopes without changing trustGrade", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: ["personal"] });
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: ["shared:work"] });
    const got = await ctxA.query(api.memory.usePolicy.get, { thoughtId });
    expect(got?.scopes).toEqual(["shared:work"]);
    expect(got?.trustGrade).toBe("evidence");
  });

  test("upsert rejects unauthenticated", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] }),
    ).rejects.toThrow(ConvexError);
  });

  test("upsert refuses cross-tenant access", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t
        .withIdentity({ subject: TEST_USER_B })
        .mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("upsert writes an audit row", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] });
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "usePolicy.upsert")).toBe(true);
  });
});
