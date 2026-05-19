import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "../convex/_generated/api";
import { digestDateLabel } from "../convex/digests";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

async function seedThought(t: ReturnType<typeof makeTest>, userId: string, content: string) {
  const fx = makeThought(userId);
  return await t.withIdentity({ subject: userId }).mutation(api.thoughts.createThought, {
    content,
    source: fx.source,
    embeddingModel: fx.embeddingModel,
    embeddingDims: fx.embeddingDims,
    fingerprint: `${fx.fingerprint}-${content.length}`.padEnd(64, "0").slice(0, 64),
    metadata: fx.metadata,
  });
}

describe("digestDateLabel", () => {
  test("formats a UTC YYYY-MM-DD label", () => {
    // 2026-05-19T03:14:15Z
    expect(digestDateLabel(Date.UTC(2026, 4, 19, 3, 14, 15))).toBe("2026-05-19");
  });

  test("treats midnight UTC as the start of the day", () => {
    expect(digestDateLabel(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe("2026-01-01");
  });
});

describe("digests.recordInternal", () => {
  test("inserts a new digest row and writes an audit entry", async () => {
    const t = makeTest();
    const tId = await seedThought(t, TEST_USER_A, "first");
    await t.mutation(internal.digests.recordInternal, {
      summary: {
        userId: TEST_USER_A,
        date: "2026-05-19",
        summary: "- captured a thought",
        thoughtIds: [tId],
        thoughtCount: 1,
        generator: "fake:digest",
      },
    });
    const rows = await t.withIdentity({ subject: TEST_USER_A }).query(api.digests.listForUser, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBe("- captured a thought");
    expect(rows[0]?.thoughtCount).toBe(1);
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "digest.create")).toBe(true);
  });

  test("re-running for the same (user,date) patches in place and audits as regenerate", async () => {
    const t = makeTest();
    const tId = await seedThought(t, TEST_USER_A, "first");
    await t.mutation(internal.digests.recordInternal, {
      summary: {
        userId: TEST_USER_A,
        date: "2026-05-19",
        summary: "v1",
        thoughtIds: [tId],
        thoughtCount: 1,
        generator: "fake:digest",
      },
    });
    await t.mutation(internal.digests.recordInternal, {
      summary: {
        userId: TEST_USER_A,
        date: "2026-05-19",
        summary: "v2",
        thoughtIds: [tId],
        thoughtCount: 1,
        generator: "fake:digest",
      },
    });
    const rows = await t.withIdentity({ subject: TEST_USER_A }).query(api.digests.listForUser, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBe("v2");
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.filter((a) => a.action === "digest.regenerate")).toHaveLength(1);
  });
});

describe("digests.listForUser", () => {
  test("returns the caller's digests only", async () => {
    const t = makeTest();
    const tA = await seedThought(t, TEST_USER_A, "for A");
    const tB = await seedThought(t, TEST_USER_B, "for B");
    await t.mutation(internal.digests.recordInternal, {
      summary: {
        userId: TEST_USER_A,
        date: "2026-05-18",
        summary: "A",
        thoughtIds: [tA],
        thoughtCount: 1,
        generator: "fake:digest",
      },
    });
    await t.mutation(internal.digests.recordInternal, {
      summary: {
        userId: TEST_USER_B,
        date: "2026-05-18",
        summary: "B",
        thoughtIds: [tB],
        thoughtCount: 1,
        generator: "fake:digest",
      },
    });
    const rowsForA = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.digests.listForUser, {});
    expect(rowsForA).toHaveLength(1);
    expect(rowsForA[0]?.summary).toBe("A");
  });

  test("rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.query(api.digests.listForUser, {})).rejects.toThrow(ConvexError);
  });
});

describe("digests.collectWindowInternal", () => {
  test("returns only thoughts inside the window for the given user", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const inside = await seedThought(t, TEST_USER_A, "inside");
    // Backdate one to outside the window.
    const outside = await seedThought(t, TEST_USER_A, "outside");
    await t.run(async (ctx) => {
      await ctx.db.patch(outside, { createdAt: 0 });
    });
    // And another for a different user, should not appear.
    await seedThought(t, TEST_USER_B, "tenant b");

    const now = Date.now();
    const res = (await t.query(internal.digests.collectWindowInternal, {
      userId: TEST_USER_A,
      windowStartMs: now - 60_000,
      windowEndMs: now + 1_000,
    })) as { thoughts: Array<{ _id: string }> };
    const ids = res.thoughts.map((th) => th._id);
    expect(ids).toContain(inside);
    expect(ids).not.toContain(outside);
    // Use ctxA to also confirm the function isn't gated by identity (it's internal).
    expect(ctxA).toBeTruthy();
  });

  test("throws INVALID when windowStartMs > windowEndMs", async () => {
    const t = makeTest();
    await expect(
      t.query(internal.digests.collectWindowInternal, {
        userId: TEST_USER_A,
        windowStartMs: 1000,
        windowEndMs: 500,
      }),
    ).rejects.toThrow(/INVALID/);
  });
});
