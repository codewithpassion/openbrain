import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "../helpers/client";
import { makeThought } from "../helpers/fixtures";

describe("memory/audit", () => {
  test("list returns only the caller's audit rows", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const ctxB = t.withIdentity({ subject: TEST_USER_B });
    const fxA = makeThought(TEST_USER_A);
    const fxB = makeThought(TEST_USER_B, { fingerprint: "b".repeat(64) });
    await ctxA.mutation(api.thoughts.createThought, {
      content: fxA.content,
      source: fxA.source,
      embeddingModel: fxA.embeddingModel,
      embeddingDims: fxA.embeddingDims,
      fingerprint: fxA.fingerprint,
      metadata: fxA.metadata,
    });
    await ctxB.mutation(api.thoughts.createThought, {
      content: fxB.content,
      source: fxB.source,
      embeddingModel: fxB.embeddingModel,
      embeddingDims: fxB.embeddingDims,
      fingerprint: fxB.fingerprint,
      metadata: fxB.metadata,
    });
    const aRows = await ctxA.query(api.memory.audit.list, { limit: 100 });
    expect(aRows.every((r) => r.userId === TEST_USER_A)).toBe(true);
    expect(aRows).not.toHaveLength(0);
  });

  test("list rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.query(api.memory.audit.list, { limit: 10 })).rejects.toThrow(ConvexError);
  });
});
