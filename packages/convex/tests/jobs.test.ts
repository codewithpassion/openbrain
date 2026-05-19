import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";

describe("jobs.recordRunInternal + listForUser", () => {
  test("user-scoped runs appear in the caller's list, newest first", async () => {
    const t = makeTest();
    await t.mutation(internal.jobs.recordRunInternal, {
      name: "digests.daily",
      userId: TEST_USER_A,
      status: "success",
      startedAt: 100,
      finishedAt: 200,
      note: "older",
    });
    await t.mutation(internal.jobs.recordRunInternal, {
      name: "digests.daily",
      userId: TEST_USER_A,
      status: "skipped",
      startedAt: 1_000,
      finishedAt: 1_100,
      note: "newer",
    });
    const rows = await t.withIdentity({ subject: TEST_USER_A }).query(api.jobs.listForUser, {});
    expect(rows).toHaveLength(2);
    expect(rows[0]?.note).toBe("newer");
    expect(rows[1]?.note).toBe("older");
  });

  test("global runs (no userId) are visible to every signed-in caller", async () => {
    const t = makeTest();
    await t.mutation(internal.jobs.recordRunInternal, {
      name: "system.heartbeat",
      status: "success",
      startedAt: 1,
      finishedAt: 2,
    });
    const rowsA = await t.withIdentity({ subject: TEST_USER_A }).query(api.jobs.listForUser, {});
    const rowsB = await t.withIdentity({ subject: TEST_USER_B }).query(api.jobs.listForUser, {});
    expect(rowsA.map((r) => r.name)).toContain("system.heartbeat");
    expect(rowsB.map((r) => r.name)).toContain("system.heartbeat");
  });

  test("another user's runs are not surfaced", async () => {
    const t = makeTest();
    await t.mutation(internal.jobs.recordRunInternal, {
      name: "digests.daily",
      userId: TEST_USER_B,
      status: "success",
      startedAt: 1,
      finishedAt: 2,
    });
    const rowsA = await t.withIdentity({ subject: TEST_USER_A }).query(api.jobs.listForUser, {});
    expect(rowsA).toHaveLength(0);
  });

  test("rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.query(api.jobs.listForUser, {})).rejects.toThrow(ConvexError);
  });
});
