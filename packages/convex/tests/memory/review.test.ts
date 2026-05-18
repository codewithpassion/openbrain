import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "../../convex/_generated/api";
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

describe("memory/review", () => {
  test("submit records a review and audits it", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.review.submit, {
      thoughtId,
      status: "confirmed",
      reviewer: TEST_USER_A,
    });
    const rows = await ctxA.query(api.memory.review.list, { thoughtId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("confirmed");
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "review.submit")).toBe(true);
  });

  test("submit rejects unauthenticated callers", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(api.memory.review.submit, {
        thoughtId,
        status: "confirmed",
        reviewer: TEST_USER_A,
      }),
    ).rejects.toThrow(ConvexError);
  });

  test("submit refuses cross-tenant access", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t.withIdentity({ subject: TEST_USER_B }).mutation(api.memory.review.submit, {
        thoughtId,
        status: "confirmed",
        reviewer: TEST_USER_B,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("promote sets trustGrade=instruction when review is confirmed", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] });
    await ctxA.mutation(api.memory.review.submit, {
      thoughtId,
      status: "confirmed",
      reviewer: TEST_USER_A,
    });
    await ctxA.mutation(api.memory.review.promote, { thoughtId });
    const policy = await ctxA.query(api.memory.usePolicy.get, { thoughtId });
    expect(policy?.trustGrade).toBe("instruction");
  });

  test("promote refuses when no confirmed review exists", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] });
    await expect(ctxA.mutation(api.memory.review.promote, { thoughtId })).rejects.toThrow(
      /REQUIRES_REVIEW/,
    );
  });

  test("submitAndPromoteInternal records review and reports promoted:false without promoteTo", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] });
    const result = await t.mutation(internal.memory.review.submitAndPromoteInternal, {
      userId: TEST_USER_A,
      thoughtId,
      status: "confirmed",
    });
    expect(result.reviewId).toBeTruthy();
    expect(result.promoted).toBe(false);
    const policy = await ctxA.query(api.memory.usePolicy.get, { thoughtId });
    expect(policy?.trustGrade).toBe("evidence");
  });

  test("submitAndPromoteInternal promotes when confirmed + promoteTo=instruction", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] });
    const result = await t.mutation(internal.memory.review.submitAndPromoteInternal, {
      userId: TEST_USER_A,
      thoughtId,
      status: "confirmed",
      promoteTo: "instruction",
    });
    expect(result.promoted).toBe(true);
    const policy = await ctxA.query(api.memory.usePolicy.get, { thoughtId });
    expect(policy?.trustGrade).toBe("instruction");
  });

  test("submitAndPromoteInternal throws REQUIRES_REVIEW when status not confirmed but promoteTo set", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] });
    await expect(
      t.mutation(internal.memory.review.submitAndPromoteInternal, {
        userId: TEST_USER_A,
        thoughtId,
        status: "needs_revision",
        promoteTo: "instruction",
      }),
    ).rejects.toThrow(/REQUIRES_REVIEW/);
  });

  test("submitAndPromoteInternal refuses cross-tenant thoughtId", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(internal.memory.review.submitAndPromoteInternal, {
        userId: TEST_USER_B,
        thoughtId,
        status: "confirmed",
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
