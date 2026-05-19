import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

async function seedThought(t: ReturnType<typeof makeTest>, userId: string, fp: string) {
  const fx = makeThought(userId);
  return await t.withIdentity({ subject: userId }).mutation(api.thoughts.createThought, {
    content: fx.content,
    source: fx.source,
    embeddingModel: fx.embeddingModel,
    embeddingDims: fx.embeddingDims,
    fingerprint: fp.padEnd(64, "0").slice(0, 64),
    metadata: fx.metadata,
  });
}

describe("brainBackup.exportForUser", () => {
  test("returns a versioned bundle containing only the caller's thoughts", async () => {
    const t = makeTest();
    await seedThought(t, TEST_USER_A, "a-fp");
    await seedThought(t, TEST_USER_A, "b-fp");
    await seedThought(t, TEST_USER_B, "z-fp");
    const bundle = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.brainBackup.exportForUser, {});
    expect(bundle.version).toBe(1);
    expect(bundle.userId).toBe(TEST_USER_A);
    expect(bundle.thoughts).toHaveLength(2);
    expect(bundle.thoughts.map((t) => t.fingerprint).sort()).toEqual(
      ["a-fp".padEnd(64, "0"), "b-fp".padEnd(64, "0")].sort(),
    );
  });

  test("rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.query(api.brainBackup.exportForUser, {})).rejects.toThrow(ConvexError);
  });
});

describe("brainBackup.restoreForCaller", () => {
  test("imports new thoughts and skips fingerprint collisions", async () => {
    const t = makeTest();
    const fx = makeThought(TEST_USER_A);
    const existingFp = "kept".padEnd(64, "0");
    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.createThought, {
      content: "kept",
      source: "dashboard",
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: existingFp,
      metadata: fx.metadata,
    });

    const result = await t
      .withIdentity({ subject: TEST_USER_A })
      .mutation(api.brainBackup.restoreForCaller, {
        thoughts: [
          {
            content: "imported",
            source: "import:bundle",
            embeddingModel: fx.embeddingModel,
            embeddingDims: fx.embeddingDims,
            fingerprint: "new".padEnd(64, "0"),
            metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
            provenance: [{ origin: "import", capturedAt: 1 }],
            sourceRefs: [],
          },
          {
            content: "duplicate by fingerprint",
            source: "import:bundle",
            embeddingModel: fx.embeddingModel,
            embeddingDims: fx.embeddingDims,
            fingerprint: existingFp,
            metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
            provenance: [],
            sourceRefs: [],
          },
        ],
      });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    const list = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.listThoughts, {});
    expect(list).toHaveLength(2);
  });

  test("restoreForCaller rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.mutation(api.brainBackup.restoreForCaller, { thoughts: [] })).rejects.toThrow(
      ConvexError,
    );
  });
});
