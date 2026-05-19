import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "../convex/_generated/api";
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

describe("entities.upsertInternal", () => {
  test("creates a new entity scoped to the userId", async () => {
    const t = makeTest();
    const id = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Cloudflare", kind: "org", aliases: ["CF"] },
    });
    expect(id).toBeTruthy();
    const rows = await t.withIdentity({ subject: TEST_USER_A }).query(api.entities.listForUser, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.canonicalName).toBe("Cloudflare");
    expect(rows[0]?.aliases).toEqual(["CF"]);
  });

  test("re-upserting merges aliases without duplicating", async () => {
    const t = makeTest();
    await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Cloudflare", kind: "org", aliases: ["CF"] },
    });
    await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Cloudflare", kind: "org", aliases: ["cflare", "CF"] },
    });
    const rows = await t.withIdentity({ subject: TEST_USER_A }).query(api.entities.listForUser, {});
    expect(rows).toHaveLength(1);
    expect(new Set(rows[0]?.aliases)).toEqual(new Set(["CF", "cflare"]));
  });

  test("entities are tenant-scoped", async () => {
    const t = makeTest();
    await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Acme", kind: "org", aliases: [] },
    });
    const rowsB = await t
      .withIdentity({ subject: TEST_USER_B })
      .query(api.entities.listForUser, {});
    expect(rowsB).toHaveLength(0);
  });
});

describe("entities.mentionInternal", () => {
  test("records a mention and is idempotent on (entity, thought)", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A, "thought-fp");
    const entityId = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Workers", kind: "topic", aliases: [] },
    });
    const m1 = await t.mutation(internal.entities.mentionInternal, {
      userId: TEST_USER_A,
      entityId,
      thoughtId,
    });
    expect(m1).not.toBeNull();
    const m2 = await t.mutation(internal.entities.mentionInternal, {
      userId: TEST_USER_A,
      entityId,
      thoughtId,
    });
    expect(m2).toBeNull();
    const mentions = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.entities.mentionsForEntity, { entityId });
    expect(mentions).toHaveLength(1);
  });

  test("refuses cross-tenant entity ids", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A, "thought-fp");
    const entityId = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Workers", kind: "topic", aliases: [] },
    });
    await expect(
      t.mutation(internal.entities.mentionInternal, {
        userId: TEST_USER_B,
        entityId,
        thoughtId,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("entities.relateInternal", () => {
  test("creates a relation and merges evidence on repeat", async () => {
    const t = makeTest();
    const t1 = await seedThought(t, TEST_USER_A, "t-1");
    const t2 = await seedThought(t, TEST_USER_A, "t-2");
    const a = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Dom", kind: "person", aliases: [] },
    });
    const b = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Cloudflare", kind: "org", aliases: [] },
    });
    await t.mutation(internal.entities.relateInternal, {
      userId: TEST_USER_A,
      relation: {
        fromEntityId: a,
        toEntityId: b,
        kind: "works_at",
        evidenceThoughtIds: [t1],
        confidence: 0.7,
      },
    });
    await t.mutation(internal.entities.relateInternal, {
      userId: TEST_USER_A,
      relation: {
        fromEntityId: a,
        toEntityId: b,
        kind: "works_at",
        evidenceThoughtIds: [t2],
        confidence: 0.9,
      },
    });
    const { outgoing } = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.entities.relationsForEntity, { entityId: a });
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]?.confidence).toBe(0.9);
    expect(new Set(outgoing[0]?.evidenceThoughtIds)).toEqual(new Set([t1, t2]));
  });
});

describe("entities.listForUser", () => {
  test("rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.query(api.entities.listForUser, {})).rejects.toThrow(ConvexError);
  });

  test("filters by kind", async () => {
    const t = makeTest();
    await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Alice", kind: "person", aliases: [] },
    });
    await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Acme", kind: "org", aliases: [] },
    });
    const people = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.entities.listForUser, { kind: "person" });
    expect(people.map((e) => e.canonicalName)).toEqual(["Alice"]);
  });
});
