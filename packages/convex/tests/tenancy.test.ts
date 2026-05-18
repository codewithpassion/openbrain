/**
 * The CLAUDE.md §6 canary. For every exposed public query/mutation, this
 * suite asserts:
 *  - calling without an authenticated identity fails with ConvexError
 *  - calling as user B for data owned by user A returns NOT_FOUND or null
 *
 * Add a new entry here every time you add a public function. The `verify`
 * apiKeys mutation is the documented exception — it MUST be callable without
 * identity (it's how identity is established from a key) so it is not in
 * this table.
 */
import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

async function seed(t: ReturnType<typeof makeTest>, userId: string) {
  const fx = makeThought(userId);
  const thoughtId = await t.withIdentity({ subject: userId }).mutation(api.thoughts.createThought, {
    content: fx.content,
    source: fx.source,
    embeddingModel: fx.embeddingModel,
    embeddingDims: fx.embeddingDims,
    fingerprint: fx.fingerprint,
    metadata: fx.metadata,
  });
  await t
    .withIdentity({ subject: userId })
    .mutation(api.memory.usePolicy.upsert, { thoughtId, scopes: [] });
  await t.withIdentity({ subject: userId }).mutation(api.memory.review.submit, {
    thoughtId,
    status: "confirmed",
    reviewer: userId,
  });
  await t.withIdentity({ subject: userId }).mutation(api.memory.provenance.record, {
    thoughtId,
    origin: "human",
  });
  await t
    .withIdentity({ subject: userId })
    .mutation(api.memory.sourceRefs.add, { thoughtId, kind: "url", uri: "https://x" });
  await t.withIdentity({ subject: userId }).mutation(api.memory.recallTraces.record, {
    thoughtId,
    query: "q",
    score: 0.5,
    clientId: "test",
  });
  return thoughtId;
}

interface Case {
  name: string;
  kind: "query" | "mutation";
  /** Whether the seeded id (a thought or api_key) must be referenced in args. */
  needsThoughtId: boolean;
  /** Returns the args object given a seeded id. */
  args: (seededId: string) => Record<string, unknown>;
  ref: unknown;
  /** Some queries return null (not throw) for cross-tenant. */
  crossTenantNullOk?: boolean;
  /**
   * Override the default thought-seeding. When supplied, this is called as
   * user A and its return value is passed to `args`. Used by apiKeys.revoke
   * (which targets an `api_keys` id, not a `thoughts` id).
   */
  customSeed?: (t: ReturnType<typeof makeTest>) => Promise<string>;
}

const cases: Case[] = [
  {
    name: "thoughts.createThought",
    kind: "mutation",
    needsThoughtId: false,
    args: () => ({
      content: "x",
      source: "s",
      embeddingModel: "m",
      embeddingDims: 1024,
      fingerprint: "f".repeat(64),
      metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
    }),
    ref: api.thoughts.createThought,
  },
  {
    name: "thoughts.getThought",
    kind: "query",
    needsThoughtId: true,
    args: (id) => ({ id }),
    ref: api.thoughts.getThought,
  },
  {
    name: "thoughts.listThoughts",
    kind: "query",
    needsThoughtId: false,
    args: () => ({ limit: 10 }),
    ref: api.thoughts.listThoughts,
    // listThoughts always returns the caller's rows (an empty list for B);
    // never throws cross-tenant — but it MUST throw when unauthenticated.
    crossTenantNullOk: true,
  },
  {
    name: "thoughts.getByFingerprint",
    kind: "query",
    needsThoughtId: false,
    args: () => ({ fingerprint: "a".repeat(64) }),
    ref: api.thoughts.getByFingerprint,
    crossTenantNullOk: true,
  },
  {
    name: "thoughts.deleteThought",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ id }),
    ref: api.thoughts.deleteThought,
  },
  {
    name: "thoughts.attachVectorizeId",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ id, vectorizeId: "v" }),
    ref: api.thoughts.attachVectorizeId,
  },
  {
    name: "memory.provenance.record",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id, origin: "human" }),
    ref: api.memory.provenance.record,
  },
  {
    name: "memory.provenance.list",
    kind: "query",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id }),
    ref: api.memory.provenance.list,
  },
  {
    name: "memory.review.submit",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id, status: "confirmed", reviewer: "u" }),
    ref: api.memory.review.submit,
  },
  {
    name: "memory.review.list",
    kind: "query",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id }),
    ref: api.memory.review.list,
  },
  {
    name: "memory.review.promote",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id }),
    ref: api.memory.review.promote,
  },
  {
    name: "memory.usePolicy.upsert",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id, scopes: [] }),
    ref: api.memory.usePolicy.upsert,
  },
  {
    name: "memory.usePolicy.get",
    kind: "query",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id }),
    ref: api.memory.usePolicy.get,
  },
  {
    name: "memory.sourceRefs.add",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id, kind: "url", uri: "https://x" }),
    ref: api.memory.sourceRefs.add,
  },
  {
    name: "memory.sourceRefs.list",
    kind: "query",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id }),
    ref: api.memory.sourceRefs.list,
  },
  {
    name: "memory.recallTraces.record",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ thoughtId: id, query: "q", score: 0.5, clientId: "c" }),
    ref: api.memory.recallTraces.record,
  },
  {
    name: "memory.recallTraces.list",
    kind: "query",
    needsThoughtId: false,
    args: () => ({ limit: 10 }),
    ref: api.memory.recallTraces.list,
    crossTenantNullOk: true,
  },
  {
    name: "memory.audit.list",
    kind: "query",
    needsThoughtId: false,
    args: () => ({ limit: 10 }),
    ref: api.memory.audit.list,
    crossTenantNullOk: true,
  },
  {
    name: "apiKeys.mint",
    kind: "mutation",
    needsThoughtId: false,
    args: () => ({ name: "x", scopes: [] }),
    ref: api.apiKeys.mint,
  },
  {
    name: "apiKeys.list",
    kind: "query",
    needsThoughtId: false,
    args: () => ({}),
    ref: api.apiKeys.list,
    crossTenantNullOk: true,
  },
  {
    name: "apiKeys.revoke",
    kind: "mutation",
    needsThoughtId: true,
    args: (id) => ({ id }),
    ref: api.apiKeys.revoke,
    customSeed: async (t) => {
      const { id } = await t
        .withIdentity({ subject: TEST_USER_A })
        .mutation(api.apiKeys.mint, { name: "tenant-canary", scopes: [] });
      return id;
    },
  },
];

// `anyApi` makes function references opaque at runtime. The cast widens to `any`
// because `FunctionReference<any,any,any,any>` is required by the convex-test signature.
// noExplicitAny is disabled in test files (biome.json overrides).
type AnyRef = any;

async function invoke(
  ctx: ReturnType<ReturnType<typeof makeTest>["withIdentity"]>,
  kind: "query" | "mutation",
  ref: unknown,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (kind === "mutation") {
    return await ctx.mutation(ref as AnyRef, args);
  }
  return await ctx.query(ref as AnyRef, args);
}

async function invokeRoot(
  t: ReturnType<typeof makeTest>,
  kind: "query" | "mutation",
  ref: unknown,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (kind === "mutation") {
    return await t.mutation(ref as AnyRef, args);
  }
  return await t.query(ref as AnyRef, args);
}

interface CrossTenantOutcome {
  kind: "rejected" | "returned" | "skipped";
  promise?: Promise<unknown>;
  result?: unknown;
}

function extractUserIds(result: unknown): string[] {
  if (Array.isArray(result)) {
    return (result as Array<{ userId?: string }>)
      .map((r) => r.userId)
      .filter((u): u is string => typeof u === "string");
  }
  if (result !== null && typeof result === "object") {
    const u = (result as { userId?: unknown }).userId;
    return typeof u === "string" ? [u] : [];
  }
  return [];
}

async function seedForCase(c: Case, t: ReturnType<typeof makeTest>): Promise<string> {
  if (c.customSeed !== undefined) {
    return await c.customSeed(t);
  }
  return await seed(t, TEST_USER_A);
}

async function runCrossTenant(c: Case): Promise<CrossTenantOutcome> {
  const t = makeTest();
  const seededId = await seedForCase(c, t);
  const ctxB = t.withIdentity({ subject: TEST_USER_B });
  const args = c.args(seededId);
  if (!c.needsThoughtId) {
    if (c.crossTenantNullOk === true) {
      const result = await invoke(ctxB, c.kind, c.ref, args);
      return { kind: "returned", result };
    }
    return { kind: "skipped" };
  }
  return { kind: "rejected", promise: invoke(ctxB, c.kind, c.ref, args) };
}

describe("tenancy guarantees (CLAUDE.md §6 canary)", () => {
  for (const c of cases) {
    test(`${c.name} rejects unauthenticated callers`, async () => {
      const t = makeTest();
      const seededId = await seedForCase(c, t);
      await expect(invokeRoot(t, c.kind, c.ref, c.args(seededId))).rejects.toThrow(ConvexError);
    });

    test(`${c.name} denies cross-tenant access`, async () => {
      const outcome = await runCrossTenant(c);
      if (outcome.kind === "rejected" && outcome.promise !== undefined) {
        await expect(outcome.promise).rejects.toThrow(/NOT_FOUND/);
        return;
      }
      if (outcome.kind === "returned") {
        for (const leakedUserId of extractUserIds(outcome.result)) {
          expect(leakedUserId).not.toBe(TEST_USER_A);
        }
      }
    });
  }

  test("apiKeys.verify is the documented exception: callable without identity", async () => {
    const t = makeTest();
    // Unknown hash returns null without throwing.
    const got = await t.mutation(api.apiKeys.verify, { hash: "0".repeat(64) });
    expect(got).toBeNull();
  });
});
