import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
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

  test("getByFingerprintInternal returns the row scoped to userId", async () => {
    const t = makeTest();
    const fx = makeThought(TEST_USER_A, { fingerprint: "z".repeat(64) });
    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    const own = await t.query(internal.thoughts.getByFingerprintInternal, {
      userId: TEST_USER_A,
      fingerprint: fx.fingerprint,
    });
    expect(own?.userId).toBe(TEST_USER_A);
    const other = await t.query(internal.thoughts.getByFingerprintInternal, {
      userId: TEST_USER_B,
      fingerprint: fx.fingerprint,
    });
    expect(other).toBeNull();
  });

  test("listThoughtsInternal filters by type/topic/person and days", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const fx1 = makeThought(TEST_USER_A, {
      fingerprint: "1".repeat(64),
      content: "idea-row",
      metadata: {
        type: "idea",
        topics: ["alpha"],
        people: ["alice"],
        action_items: [],
        dates_mentioned: [],
      },
    });
    const fx2 = makeThought(TEST_USER_A, {
      fingerprint: "2".repeat(64),
      content: "task-row",
      metadata: {
        type: "task",
        topics: ["beta"],
        people: ["bob"],
        action_items: [],
        dates_mentioned: [],
      },
    });
    for (const fx of [fx1, fx2]) {
      await ctxA.mutation(api.thoughts.createThought, {
        content: fx.content,
        source: fx.source,
        embeddingModel: fx.embeddingModel,
        embeddingDims: fx.embeddingDims,
        fingerprint: fx.fingerprint,
        metadata: fx.metadata,
      });
    }
    const byType = await t.query(internal.thoughts.listThoughtsInternal, {
      userId: TEST_USER_A,
      type: "task",
    });
    expect(byType.map((r) => r.content)).toEqual(["task-row"]);
    const byTopic = await t.query(internal.thoughts.listThoughtsInternal, {
      userId: TEST_USER_A,
      topic: "alpha",
    });
    expect(byTopic.map((r) => r.content)).toEqual(["idea-row"]);
    const byPerson = await t.query(internal.thoughts.listThoughtsInternal, {
      userId: TEST_USER_A,
      person: "bob",
    });
    expect(byPerson.map((r) => r.content)).toEqual(["task-row"]);
  });

  test("statsInternal returns topPeople sorted by count desc", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const seeds: { fp: string; people: string[] }[] = [
      { fp: "1".repeat(64), people: ["alice"] },
      { fp: "2".repeat(64), people: ["alice", "bob"] },
      { fp: "3".repeat(64), people: ["bob"] },
    ];
    for (const s of seeds) {
      const fx = makeThought(TEST_USER_A, {
        fingerprint: s.fp,
        metadata: {
          topics: [],
          people: s.people,
          action_items: [],
          dates_mentioned: [],
        },
      });
      await ctxA.mutation(api.thoughts.createThought, {
        content: fx.content,
        source: fx.source,
        embeddingModel: fx.embeddingModel,
        embeddingDims: fx.embeddingDims,
        fingerprint: fx.fingerprint,
        metadata: fx.metadata,
      });
    }
    const stats = await t.query(internal.thoughts.statsInternal, { userId: TEST_USER_A });
    expect(stats.topPeople).toEqual([
      { name: "alice", count: 2 },
      { name: "bob", count: 2 },
    ]);
  });

  test("getByFingerprintInternal returns null when no match", async () => {
    const t = makeTest();
    const _unused: Id<"thoughts"> | null = null;
    void _unused;
    const got = await t.query(internal.thoughts.getByFingerprintInternal, {
      userId: TEST_USER_A,
      fingerprint: "x".repeat(64),
    });
    expect(got).toBeNull();
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

  test("updateContent patches content + fingerprint + metadata and audits the edit", async () => {
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
    const newFp = "new-fp".padEnd(64, "0");
    await ctxA.mutation(api.thoughts.updateContent, {
      id,
      content: "rewritten content",
      fingerprint: newFp,
      metadata: { ...fx.metadata, topics: ["renamed"] },
    });
    const got = await ctxA.query(api.thoughts.getThought, { id });
    expect(got?.content).toBe("rewritten content");
    expect(got?.fingerprint).toBe(newFp);
    expect(got?.metadata.topics).toEqual(["renamed"]);
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "thought.updateContent")).toBe(true);
  });

  test("updateContent rejects when the fingerprint already exists on another thought", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const fxA = makeThought(TEST_USER_A);
    const a = await ctxA.mutation(api.thoughts.createThought, {
      content: "a",
      source: fxA.source,
      embeddingModel: fxA.embeddingModel,
      embeddingDims: fxA.embeddingDims,
      fingerprint: "fp-a".padEnd(64, "0"),
      metadata: fxA.metadata,
    });
    await ctxA.mutation(api.thoughts.createThought, {
      content: "b",
      source: fxA.source,
      embeddingModel: fxA.embeddingModel,
      embeddingDims: fxA.embeddingDims,
      fingerprint: "fp-b".padEnd(64, "0"),
      metadata: fxA.metadata,
    });
    await expect(
      ctxA.mutation(api.thoughts.updateContent, {
        id: a,
        content: "now duplicates b",
        fingerprint: "fp-b".padEnd(64, "0"),
        metadata: fxA.metadata,
      }),
    ).rejects.toThrow(/FINGERPRINT_COLLISION/);
  });

  test("updateContent refuses cross-tenant access", async () => {
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
      t.withIdentity({ subject: TEST_USER_B }).mutation(api.thoughts.updateContent, {
        id,
        content: "stolen",
        fingerprint: "fp-x".padEnd(64, "0"),
        metadata: fx.metadata,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
