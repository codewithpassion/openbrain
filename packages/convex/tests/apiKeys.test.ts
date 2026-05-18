import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";

describe("apiKeys", () => {
  test("mint returns a raw key once and stores only the hash", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const result = await ctxA.mutation(api.apiKeys.mint, {
      name: "cli on laptop",
      scopes: ["capture", "search"],
    });
    expect(result.rawKey).toMatch(/.{20,}/);
    expect(result.id).toBeTruthy();
    const stored = await t.run(async (ctx) =>
      ctx.db
        .query("api_keys")
        .withIndex("by_user", (q) => q.eq("userId", TEST_USER_A))
        .unique(),
    );
    expect(stored).not.toBeNull();
    // Raw key MUST NOT be stored.
    expect(JSON.stringify(stored)).not.toContain(result.rawKey);
    expect(typeof stored?.hash).toBe("string");
    expect(stored?.hash.length).toBe(64); // SHA-256 hex
  });

  test("mint rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.mutation(api.apiKeys.mint, { name: "x", scopes: [] })).rejects.toThrow(
      ConvexError,
    );
  });

  test("verify returns the key row for a valid hash and updates lastUsedAt", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const { rawKey } = await ctxA.mutation(api.apiKeys.mint, {
      name: "x",
      scopes: ["capture"],
    });
    const hash = await sha256Hex(rawKey);
    const row = await t.mutation(api.apiKeys.verify, { hash });
    expect(row?.userId).toBe(TEST_USER_A);
    expect(typeof row?.lastUsedAt).toBe("number");
  });

  test("verify returns null for an unknown hash", async () => {
    const t = makeTest();
    const got = await t.mutation(api.apiKeys.verify, { hash: "a".repeat(64) });
    expect(got).toBeNull();
  });

  test("verify returns null for an expired key", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const expiresAt = Date.now() - 1000;
    const { rawKey } = await ctxA.mutation(api.apiKeys.mint, {
      name: "x",
      scopes: ["capture"],
      expiresAt,
    });
    const hash = await sha256Hex(rawKey);
    const got = await t.mutation(api.apiKeys.verify, { hash });
    expect(got).toBeNull();
  });

  test("revoke deletes the caller's key and refuses other tenants' keys", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const { id } = await ctxA.mutation(api.apiKeys.mint, { name: "x", scopes: ["capture"] });
    const ctxB = t.withIdentity({ subject: TEST_USER_B });
    await expect(ctxB.mutation(api.apiKeys.revoke, { id })).rejects.toThrow(/NOT_FOUND/);
    await ctxA.mutation(api.apiKeys.revoke, { id });
    const remaining = await ctxA.query(api.apiKeys.list);
    expect(remaining).toHaveLength(0);
  });

  test("list returns only the caller's keys", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const ctxB = t.withIdentity({ subject: TEST_USER_B });
    await ctxA.mutation(api.apiKeys.mint, { name: "a", scopes: [] });
    await ctxB.mutation(api.apiKeys.mint, { name: "b", scopes: [] });
    const rows = await ctxA.query(api.apiKeys.list);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("a");
  });
});

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
