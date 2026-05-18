import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

describe("thoughts", () => {
  test("createThought stores a row scoped to the authenticated user", async () => {
    const t = makeTest();
    const fx = makeThought(TEST_USER_A);
    const id = await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    expect(id).toBeTruthy();
    const got = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.getThought, { id });
    expect(got?.content).toBe(fx.content);
    expect(got?.userId).toBe(TEST_USER_A);
  });

  test("createThought rejects unauthenticated calls", async () => {
    const t = makeTest();
    const fx = makeThought(TEST_USER_A);
    await expect(
      t.mutation(api.thoughts.createThought, {
        content: fx.content,
        source: fx.source,
        embeddingModel: fx.embeddingModel,
        embeddingDims: fx.embeddingDims,
        fingerprint: fx.fingerprint,
        metadata: fx.metadata,
      }),
    ).rejects.toThrow(ConvexError);
  });

  test("getThought returns NOT_FOUND for another tenant's thought", async () => {
    const t = makeTest();
    const fx = makeThought(TEST_USER_A);
    const id = await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    await expect(
      t.withIdentity({ subject: TEST_USER_B }).query(api.thoughts.getThought, { id }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("listThoughts returns only the caller's rows ordered by createdAt desc", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const ctxB = t.withIdentity({ subject: TEST_USER_B });
    const a1 = makeThought(TEST_USER_A, { content: "first", fingerprint: "1".repeat(64) });
    const a2 = makeThought(TEST_USER_A, { content: "second", fingerprint: "2".repeat(64) });
    const b1 = makeThought(TEST_USER_B, { content: "other tenant", fingerprint: "3".repeat(64) });
    await ctxA.mutation(api.thoughts.createThought, {
      content: a1.content,
      source: a1.source,
      embeddingModel: a1.embeddingModel,
      embeddingDims: a1.embeddingDims,
      fingerprint: a1.fingerprint,
      metadata: a1.metadata,
    });
    await ctxA.mutation(api.thoughts.createThought, {
      content: a2.content,
      source: a2.source,
      embeddingModel: a2.embeddingModel,
      embeddingDims: a2.embeddingDims,
      fingerprint: a2.fingerprint,
      metadata: a2.metadata,
    });
    await ctxB.mutation(api.thoughts.createThought, {
      content: b1.content,
      source: b1.source,
      embeddingModel: b1.embeddingModel,
      embeddingDims: b1.embeddingDims,
      fingerprint: b1.fingerprint,
      metadata: b1.metadata,
    });
    const list = await ctxA.query(api.thoughts.listThoughts, { limit: 10 });
    expect(list.map((r) => r.content)).toEqual(["second", "first"]);
  });

  test("getByFingerprint finds a thought by fingerprint scoped to user", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const fx = makeThought(TEST_USER_A, { fingerprint: "f".repeat(64) });
    await ctxA.mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    const got = await ctxA.query(api.thoughts.getByFingerprint, { fingerprint: fx.fingerprint });
    expect(got?.content).toBe(fx.content);

    const ctxB = t.withIdentity({ subject: TEST_USER_B });
    const missing = await ctxB.query(api.thoughts.getByFingerprint, {
      fingerprint: fx.fingerprint,
    });
    expect(missing).toBeNull();
  });

  test("deleteThought removes own row and refuses other tenant's row", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const fx = makeThought(TEST_USER_A);
    const id = await ctxA.mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    const ctxB = t.withIdentity({ subject: TEST_USER_B });
    await expect(ctxB.mutation(api.thoughts.deleteThought, { id })).rejects.toThrow(/NOT_FOUND/);
    await ctxA.mutation(api.thoughts.deleteThought, { id });
    const got = await ctxA.query(api.thoughts.getThought, { id });
    expect(got).toBeNull();
  });

  test("attachVectorizeId records the vectorize id on the caller's thought", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const fx = makeThought(TEST_USER_A);
    const id = await ctxA.mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    await ctxA.mutation(api.thoughts.attachVectorizeId, { id, vectorizeId: "vec-123" });
    const got = await ctxA.query(api.thoughts.getThought, { id });
    expect(got?.vectorizeId).toBe("vec-123");
  });

  test("createThought writes a memory_audit row", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const fx = makeThought(TEST_USER_A);
    const id = await ctxA.mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    const auditRows = await t.run(async (ctx) => {
      return await ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect();
    });
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0]?.action).toBe("thought.create");
    expect(auditRows[0]?.thoughtId).toBe(id);
  });
});
