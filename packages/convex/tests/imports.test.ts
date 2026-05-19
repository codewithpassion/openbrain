import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";

describe("imports", () => {
  test("startInternal creates a running row visible only to the caller", async () => {
    const t = makeTest();
    await t.mutation(internal.imports.startInternal, {
      userId: TEST_USER_A,
      source: "gmail",
      direction: "import",
    });
    await t.mutation(internal.imports.startInternal, {
      userId: TEST_USER_B,
      source: "gmail",
      direction: "import",
    });
    const rowsA = await t.withIdentity({ subject: TEST_USER_A }).query(api.imports.listForUser, {});
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]?.status).toBe("running");
    expect(rowsA[0]?.source).toBe("gmail");
  });

  test("updateInternal advances status, stats, and refuses cross-tenant", async () => {
    const t = makeTest();
    const id = await t.mutation(internal.imports.startInternal, {
      userId: TEST_USER_A,
      source: "obsidian",
      direction: "import",
    });
    await t.mutation(internal.imports.updateInternal, {
      id,
      userId: TEST_USER_A,
      status: "success",
      stats: { processed: 5, created: 4, skipped: 1, errors: 0 },
      note: "ok",
    });
    const rowsA = await t.withIdentity({ subject: TEST_USER_A }).query(api.imports.listForUser, {});
    expect(rowsA[0]?.status).toBe("success");
    expect(rowsA[0]?.stats.created).toBe(4);

    await expect(
      t.mutation(internal.imports.updateInternal, {
        id,
        userId: TEST_USER_B,
        status: "failure",
        stats: { processed: 0, created: 0, skipped: 0, errors: 1 },
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("listForUser rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.query(api.imports.listForUser, {})).rejects.toThrow(ConvexError);
  });
});
