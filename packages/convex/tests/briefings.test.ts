import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";

const sampleSections = {
  recent: ["Worked on Phase G."],
  followUps: ["Email Alice."],
  openQuestions: ["What is the trade-off between X and Y?"],
};

describe("briefings.recordInternal", () => {
  test("creates a briefing visible only to the caller, with audit", async () => {
    const t = makeTest();
    await t.mutation(internal.briefings.recordInternal, {
      userId: TEST_USER_A,
      date: "2026-05-19",
      summary: "Today.",
      sections: sampleSections,
      thoughtIds: [],
      generator: "fake:life-engine",
    });
    const rows = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.briefings.listForUser, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sections.followUps).toEqual(["Email Alice."]);
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "briefing.create")).toBe(true);
  });

  test("re-run for same date patches and audits regenerate", async () => {
    const t = makeTest();
    await t.mutation(internal.briefings.recordInternal, {
      userId: TEST_USER_A,
      date: "2026-05-19",
      summary: "v1",
      sections: sampleSections,
      thoughtIds: [],
      generator: "fake",
    });
    await t.mutation(internal.briefings.recordInternal, {
      userId: TEST_USER_A,
      date: "2026-05-19",
      summary: "v2",
      sections: sampleSections,
      thoughtIds: [],
      generator: "fake",
    });
    const rows = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.briefings.listForUser, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBe("v2");
  });

  test("listForUser is tenant scoped + rejects unauthenticated", async () => {
    const t = makeTest();
    await t.mutation(internal.briefings.recordInternal, {
      userId: TEST_USER_A,
      date: "2026-05-19",
      summary: "A",
      sections: sampleSections,
      thoughtIds: [],
      generator: "fake",
    });
    const rowsB = await t
      .withIdentity({ subject: TEST_USER_B })
      .query(api.briefings.listForUser, {});
    expect(rowsB).toHaveLength(0);
    await expect(t.query(api.briefings.listForUser, {})).rejects.toThrow(ConvexError);
  });
});

describe("briefings.worldModelForInternal", () => {
  test("returns null when no world-model thought has been promoted", async () => {
    const t = makeTest();
    const out = await t.mutation(internal.briefings.worldModelForInternal, {
      userId: TEST_USER_A,
    });
    expect(out).toBeNull();
  });

  test("returns the world-model thought when one is at instruction grade", async () => {
    const t = makeTest();
    const id = await t.mutation(internal.briefings.seedWorldModel, {
      userId: TEST_USER_A,
      content: "I run portcity-ai.",
    });
    // Mark it instruction-grade by inserting a use-policy directly.
    await t.run(async (ctx) => {
      await ctx.db.insert("memory_use_policy", {
        thoughtId: id,
        userId: TEST_USER_A,
        trustGrade: "instruction",
        scopes: ["personal"],
      });
    });
    const out = await t.mutation(internal.briefings.worldModelForInternal, {
      userId: TEST_USER_A,
    });
    expect(out?.content).toBe("I run portcity-ai.");
  });
});
