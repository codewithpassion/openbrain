import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";

describe("projects", () => {
  test("creates a project scoped to the authenticated user", async () => {
    const t = makeTest();
    const id = await t.withIdentity({ subject: TEST_USER_A }).mutation(api.projects.create, {
      slug: "work",
      name: "Work",
    });
    expect(id).toBeTruthy();
    const list = await t.withIdentity({ subject: TEST_USER_A }).query(api.projects.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]?.slug).toBe("work");
    expect(list[0]?.userId).toBe(TEST_USER_A);
  });

  test("rejects unauthenticated create", async () => {
    const t = makeTest();
    await expect(t.mutation(api.projects.create, { slug: "work", name: "Work" })).rejects.toThrow(
      ConvexError,
    );
  });

  test("rejects duplicate slug per user", async () => {
    const t = makeTest();
    const ctx = t.withIdentity({ subject: TEST_USER_A });
    await ctx.mutation(api.projects.create, { slug: "work", name: "Work" });
    await expect(
      ctx.mutation(api.projects.create, { slug: "work", name: "Work 2" }),
    ).rejects.toThrow(/SLUG_TAKEN/);
  });

  test("permits same slug across different users", async () => {
    const t = makeTest();
    await t
      .withIdentity({ subject: TEST_USER_A })
      .mutation(api.projects.create, { slug: "work", name: "Work A" });
    const idB = await t
      .withIdentity({ subject: TEST_USER_B })
      .mutation(api.projects.create, { slug: "work", name: "Work B" });
    expect(idB).toBeTruthy();
  });

  test("list returns only the caller's projects", async () => {
    const t = makeTest();
    await t
      .withIdentity({ subject: TEST_USER_A })
      .mutation(api.projects.create, { slug: "work", name: "Work" });
    await t
      .withIdentity({ subject: TEST_USER_B })
      .mutation(api.projects.create, { slug: "side", name: "Side" });
    const listA = await t.withIdentity({ subject: TEST_USER_A }).query(api.projects.list, {});
    expect(listA).toHaveLength(1);
    expect(listA[0]?.slug).toBe("work");
  });

  test("getBySlug returns the project or null", async () => {
    const t = makeTest();
    const ctx = t.withIdentity({ subject: TEST_USER_A });
    await ctx.mutation(api.projects.create, { slug: "work", name: "Work" });
    const got = await ctx.query(api.projects.getBySlug, { slug: "work" });
    expect(got?.slug).toBe("work");
    const missing = await ctx.query(api.projects.getBySlug, { slug: "nope" });
    expect(missing).toBeNull();
  });

  test("rejects invalid slug format", async () => {
    const t = makeTest();
    const ctx = t.withIdentity({ subject: TEST_USER_A });
    await expect(
      ctx.mutation(api.projects.create, { slug: "Has Space", name: "x" }),
    ).rejects.toThrow(/INVALID_SLUG/);
    await expect(ctx.mutation(api.projects.create, { slug: "UPPER", name: "x" })).rejects.toThrow(
      /INVALID_SLUG/,
    );
    await expect(
      ctx.mutation(api.projects.create, { slug: "-leading", name: "x" }),
    ).rejects.toThrow(/INVALID_SLUG/);
  });
});
