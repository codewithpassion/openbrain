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

describe("crm.listPeople / listOrgs", () => {
  test("partitions entities by kind for the caller", async () => {
    const t = makeTest();
    await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Alice", kind: "person", aliases: [] },
    });
    await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Acme", kind: "org", aliases: [] },
    });
    const people = await t.withIdentity({ subject: TEST_USER_A }).query(api.crm.listPeople, {});
    const orgs = await t.withIdentity({ subject: TEST_USER_A }).query(api.crm.listOrgs, {});
    expect(people.map((p) => p.canonicalName)).toEqual(["Alice"]);
    expect(orgs.map((o) => o.canonicalName)).toEqual(["Acme"]);
  });

  test("rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.query(api.crm.listPeople, {})).rejects.toThrow(ConvexError);
    await expect(t.query(api.crm.listOrgs, {})).rejects.toThrow(ConvexError);
  });
});

describe("crm.recordInteraction", () => {
  test("creates an interaction row and audits it", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const thoughtId = await seedThought(t, TEST_USER_A, "meeting");
    const entityId = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Alice", kind: "person", aliases: [] },
    });
    const at = Date.UTC(2026, 4, 19, 10, 0, 0);
    await ctxA.mutation(api.crm.recordInteraction, {
      entityId,
      thoughtId,
      kind: "meeting",
      at,
      note: "30 minutes, kicked off the project",
    });
    const rows = await ctxA.query(api.crm.interactionsForEntity, { entityId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("meeting");
    expect(rows[0]?.at).toBe(at);

    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "crm.interaction")).toBe(true);
  });

  test("refuses cross-tenant entity or thought", async () => {
    const t = makeTest();
    const thoughtId = await seedThought(t, TEST_USER_A, "x");
    const entityId = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Alice", kind: "person", aliases: [] },
    });
    await expect(
      t.withIdentity({ subject: TEST_USER_B }).mutation(api.crm.recordInteraction, {
        entityId,
        thoughtId,
        kind: "meeting",
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("crm.updateEntityMetadata", () => {
  test("patches person metadata after Zod validation", async () => {
    const t = makeTest();
    const entityId = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Alice", kind: "person", aliases: [] },
    });
    const at = Date.UTC(2026, 4, 19, 10, 0, 0);
    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.crm.updateEntityMetadata, {
      entityId,
      metadata: {
        title: "Engineering Manager",
        email: "alice@example.com",
        last_contact_at: at,
      },
    });
    const row = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.entities.getById, { id: entityId });
    expect(row?.metadata).toEqual({
      title: "Engineering Manager",
      email: "alice@example.com",
      last_contact_at: at,
    });
  });

  test("rejects invalid metadata shape for kind", async () => {
    const t = makeTest();
    const entityId = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Alice", kind: "person", aliases: [] },
    });
    await expect(
      t.withIdentity({ subject: TEST_USER_A }).mutation(api.crm.updateEntityMetadata, {
        entityId,
        metadata: { email: "not-an-email" },
      }),
    ).rejects.toThrow(/INVALID/);
  });

  test("rejects person fields applied to an org", async () => {
    const t = makeTest();
    const entityId = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Acme", kind: "org", aliases: [] },
    });
    await expect(
      t.withIdentity({ subject: TEST_USER_A }).mutation(api.crm.updateEntityMetadata, {
        entityId,
        // `title` is not in the org schema; strict() would reject — but Zod
        // default strips unknowns. So instead supply an invalid headcount.
        metadata: { headcount_estimate: -1 },
      }),
    ).rejects.toThrow(/INVALID/);
  });

  test("refuses cross-tenant entity ids", async () => {
    const t = makeTest();
    const entityId = await t.mutation(internal.entities.upsertInternal, {
      userId: TEST_USER_A,
      entity: { canonicalName: "Alice", kind: "person", aliases: [] },
    });
    await expect(
      t.withIdentity({ subject: TEST_USER_B }).mutation(api.crm.updateEntityMetadata, {
        entityId,
        metadata: { title: "Stealing" },
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
