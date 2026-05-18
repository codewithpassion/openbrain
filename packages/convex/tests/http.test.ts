/**
 * HTTP trust-boundary tests. The MCP Worker enters Convex through `http.ts`
 * after validating an OAuth token; this suite asserts the header contract
 * (CLAUDE.md §"Patterns" — MCP Worker → Convex trust boundary):
 *
 *   - missing X-OpenBrains-Internal-Secret  → 401
 *   - wrong   X-OpenBrains-Internal-Secret  → 401
 *   - missing X-OpenBrains-User-Id          → 400
 *   - cross-tenant userId                   → no leak (recall/by-fingerprint
 *                                              return empty/null; writeback
 *                                              creates a row for that user)
 *
 * Happy paths per endpoint live below.
 */
import { describe, expect, test } from "bun:test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

const SECRET = "test-secret-value";

// http.ts reads process.env["INTERNAL_API_SECRET"] at request time; set it
// once for the whole suite.
process.env["INTERNAL_API_SECRET"] = SECRET;

function authHeaders(userId: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-openbrains-internal-secret": SECRET,
  };
  if (userId !== undefined) {
    h["x-openbrains-user-id"] = userId;
  }
  return h;
}

async function seedThoughtAsA(t: ReturnType<typeof makeTest>): Promise<Id<"thoughts">> {
  const fx = makeThought(TEST_USER_A);
  return await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.createThought, {
    content: fx.content,
    source: fx.source,
    embeddingModel: fx.embeddingModel,
    embeddingDims: fx.embeddingDims,
    fingerprint: fx.fingerprint,
    metadata: fx.metadata,
  });
}

describe("http auth gate", () => {
  test("missing internal secret returns 401", async () => {
    const t = makeTest();
    const res = await t.fetch("/api/thoughts/by-fingerprint", {
      method: "POST",
      headers: { "content-type": "application/json", "x-openbrains-user-id": TEST_USER_A },
      body: JSON.stringify({ fingerprint: "a".repeat(64) }),
    });
    expect(res.status).toBe(401);
  });

  test("wrong internal secret returns 401", async () => {
    const t = makeTest();
    const res = await t.fetch("/api/thoughts/by-fingerprint", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openbrains-internal-secret": "wrong",
        "x-openbrains-user-id": TEST_USER_A,
      },
      body: JSON.stringify({ fingerprint: "a".repeat(64) }),
    });
    expect(res.status).toBe(401);
  });

  test("missing user-id returns 400", async () => {
    const t = makeTest();
    const res = await t.fetch("/api/thoughts/by-fingerprint", {
      method: "POST",
      headers: authHeaders(undefined),
      body: JSON.stringify({ fingerprint: "a".repeat(64) }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/thoughts/by-fingerprint", () => {
  test("returns the existing thought for the caller", async () => {
    const t = makeTest();
    const fx = makeThought(TEST_USER_A, { fingerprint: "f".repeat(64) });
    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    const res = await t.fetch("/api/thoughts/by-fingerprint", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({ fingerprint: "f".repeat(64) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { thought: { content: string; userId: string } | null };
    expect(body.thought?.content).toBe(fx.content);
    expect(body.thought?.userId).toBe(TEST_USER_A);
  });

  test("cross-tenant fingerprint returns thought:null", async () => {
    const t = makeTest();
    const fx = makeThought(TEST_USER_A, { fingerprint: "f".repeat(64) });
    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    const res = await t.fetch("/api/thoughts/by-fingerprint", {
      method: "POST",
      headers: authHeaders(TEST_USER_B),
      body: JSON.stringify({ fingerprint: "f".repeat(64) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { thought: unknown };
    expect(body.thought).toBeNull();
  });
});

describe("POST /api/memory/recall", () => {
  test("joins thoughts with provenance and use-policy", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const id = await seedThoughtAsA(t);
    await ctxA.mutation(api.memory.usePolicy.upsert, { thoughtId: id, scopes: ["personal"] });
    await ctxA.mutation(api.memory.provenance.record, { thoughtId: id, origin: "human" });
    const res = await t.fetch("/api/memory/recall", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({ thoughtIds: [id], query: "test query", scores: [0.9] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: {
        thought: { _id: string };
        provenance: { origin: string } | null;
        usePolicy: { trustGrade: string } | null;
      }[];
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.thought._id).toBe(id);
    expect(body.items[0]?.provenance?.origin).toBe("human");
    expect(body.items[0]?.usePolicy?.trustGrade).toBe("evidence");
  });

  test("cross-tenant ids are silently dropped (no existence leak)", async () => {
    const t = makeTest();
    const id = await seedThoughtAsA(t);
    const res = await t.fetch("/api/memory/recall", {
      method: "POST",
      headers: authHeaders(TEST_USER_B),
      body: JSON.stringify({ thoughtIds: [id] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  test("writes a recall trace per returned thought (skips dropped rows)", async () => {
    const t = makeTest();
    const id = await seedThoughtAsA(t);
    const otherUserId = TEST_USER_B;
    // Seed a thought owned by user B (used to assert cross-tenant ids do NOT
    // produce trace rows in A's table).
    const fxB = makeThought(otherUserId, { fingerprint: "b".repeat(64) });
    const bId = await t
      .withIdentity({ subject: otherUserId })
      .mutation(api.thoughts.createThought, {
        content: fxB.content,
        source: fxB.source,
        embeddingModel: fxB.embeddingModel,
        embeddingDims: fxB.embeddingDims,
        fingerprint: fxB.fingerprint,
        metadata: fxB.metadata,
      });

    const res = await t.fetch("/api/memory/recall", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({ thoughtIds: [id, bId], query: "q", scores: [0.9, 0.8] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);

    const traces = await t.run((ctx) =>
      ctx.db
        .query("memory_recall_traces")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(traces).toHaveLength(1);
    expect(traces[0]?.thoughtId).toBe(id);
    expect(traces[0]?.query).toBe("q");
    expect(traces[0]?.score).toBe(0.9);
    expect(traces[0]?.clientId).toBe("mcp");
  });
});

describe("POST /api/memory/writeback", () => {
  test("creates a thought + provenance + use-policy at evidence grade", async () => {
    const t = makeTest();
    const res = await t.fetch("/api/memory/writeback", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({
        content: "agent-inferred memo",
        source: "mcp",
        embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
        embeddingDims: 1024,
        fingerprint: "c".repeat(64),
        metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
        provenance: { origin: "agent_inferred", agent: "claude", sessionId: "s1" },
        scopes: ["personal"],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { thoughtId: string };
    expect(body.thoughtId).toBeTruthy();

    const policy = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.memory.usePolicy.get, { thoughtId: body.thoughtId as never });
    expect(policy?.trustGrade).toBe("evidence");
    expect(policy?.scopes).toEqual(["personal"]);

    const provRows = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.memory.provenance.list, { thoughtId: body.thoughtId as never });
    expect(provRows[0]?.origin).toBe("agent_inferred");
    expect(provRows[0]?.agent).toBe("claude");
  });

  test("ignores any client-provided trustGrade and still writes evidence", async () => {
    const t = makeTest();
    const res = await t.fetch("/api/memory/writeback", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({
        content: "trying to sneak instruction",
        source: "mcp",
        embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
        embeddingDims: 1024,
        fingerprint: "d".repeat(64),
        metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
        provenance: { origin: "agent_generated" },
        // Intentionally extra/sneaky field; the endpoint must not honor it.
        trustGrade: "instruction",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { thoughtId: string };
    const policy = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.memory.usePolicy.get, { thoughtId: body.thoughtId as never });
    expect(policy?.trustGrade).toBe("evidence");
  });

  test("two tenants writing the same fingerprint produce two isolated rows", async () => {
    const t = makeTest();
    const body = {
      content: "shared content text",
      source: "mcp",
      embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
      embeddingDims: 1024,
      fingerprint: "9".repeat(64),
      metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
      provenance: { origin: "agent_inferred" as const },
    };
    const resA = await t.fetch("/api/memory/writeback", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify(body),
    });
    const resB = await t.fetch("/api/memory/writeback", {
      method: "POST",
      headers: authHeaders(TEST_USER_B),
      body: JSON.stringify(body),
    });
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const a = (await resA.json()) as { thoughtId: string };
    const b = (await resB.json()) as { thoughtId: string };
    expect(a.thoughtId).not.toBe(b.thoughtId);
    const rows = await t.run((ctx) => ctx.db.query("thoughts").collect());
    const aRow = rows.find((r) => r._id === a.thoughtId);
    const bRow = rows.find((r) => r._id === b.thoughtId);
    expect(aRow?.userId).toBe(TEST_USER_A);
    expect(bRow?.userId).toBe(TEST_USER_B);
  });

  test("writes a memory_audit row", async () => {
    const t = makeTest();
    const res = await t.fetch("/api/memory/writeback", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({
        content: "audit me",
        source: "mcp",
        embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
        embeddingDims: 1024,
        fingerprint: "e".repeat(64),
        metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
        provenance: { origin: "agent_inferred" },
      }),
    });
    expect(res.status).toBe(200);
    const audits = await t.run((ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "thought.create")).toBe(true);
    expect(audits.some((a) => a.action === "provenance.record")).toBe(true);
    expect(audits.some((a) => a.action === "usePolicy.upsert")).toBe(true);
  });
});

describe("POST /api/memory/review", () => {
  test("submits a review and returns promoted:false when promoteTo absent", async () => {
    const t = makeTest();
    const id = await seedThoughtAsA(t);
    await t
      .withIdentity({ subject: TEST_USER_A })
      .mutation(api.memory.usePolicy.upsert, { thoughtId: id, scopes: [] });
    const res = await t.fetch("/api/memory/review", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({ thoughtId: id, status: "confirmed" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reviewId: string; promoted: boolean };
    expect(body.reviewId).toBeTruthy();
    expect(body.promoted).toBe(false);
  });

  test("promotes to instruction when confirmed + promoteTo=instruction", async () => {
    const t = makeTest();
    const id = await seedThoughtAsA(t);
    await t
      .withIdentity({ subject: TEST_USER_A })
      .mutation(api.memory.usePolicy.upsert, { thoughtId: id, scopes: [] });
    const res = await t.fetch("/api/memory/review", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({ thoughtId: id, status: "confirmed", promoteTo: "instruction" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reviewId: string; promoted: boolean };
    expect(body.promoted).toBe(true);
    const policy = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.memory.usePolicy.get, { thoughtId: id as never });
    expect(policy?.trustGrade).toBe("instruction");
    // Both review.submit and review.promote must be audited (Audit-log spec).
    const audits = await t.run((ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.filter((a) => a.action === "review.submit")).toHaveLength(1);
    expect(audits.filter((a) => a.action === "review.promote")).toHaveLength(1);
  });

  test("refuses promotion when status is not confirmed", async () => {
    const t = makeTest();
    const id = await seedThoughtAsA(t);
    await t
      .withIdentity({ subject: TEST_USER_A })
      .mutation(api.memory.usePolicy.upsert, { thoughtId: id, scopes: [] });
    const res = await t.fetch("/api/memory/review", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({
        thoughtId: id,
        status: "needs_revision",
        promoteTo: "instruction",
      }),
    });
    // The internal mutation throws ConvexError("REQUIRES_REVIEW") → convex-test
    // surfaces that as a 500 from the HTTP action. The exact status isn't the
    // point; what matters is the policy was not promoted.
    expect(res.status).toBeGreaterThanOrEqual(400);
    const policy = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.memory.usePolicy.get, { thoughtId: id as never });
    expect(policy?.trustGrade).toBe("evidence");
  });
});

describe("POST /api/thoughts/list", () => {
  test("applies type filter pushdown", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const fx1 = makeThought(TEST_USER_A, {
      fingerprint: "1".repeat(64),
      content: "an idea",
      metadata: {
        type: "idea",
        topics: ["work"],
        people: ["alice"],
        action_items: [],
        dates_mentioned: [],
      },
    });
    const fx2 = makeThought(TEST_USER_A, {
      fingerprint: "2".repeat(64),
      content: "a task",
      metadata: {
        type: "task",
        topics: ["home"],
        people: ["bob"],
        action_items: [],
        dates_mentioned: [],
      },
    });
    for (const fx of [fx1, fx2]) {
      await ctxA.mutation(api.thoughts.createThought, {
        content: fx.content,
        source: fx.source,
        embeddingModel: fx.embeddingModel,
        embeddingDims: fx.embeddingDims,
        fingerprint: fx.fingerprint,
        metadata: fx.metadata,
      });
    }
    const res = await t.fetch("/api/thoughts/list", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({ type: "task" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { content: string }[] };
    expect(body.rows.map((r) => r.content)).toEqual(["a task"]);
  });

  test("applies topic + person + days filters", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const fx = makeThought(TEST_USER_A, {
      fingerprint: "3".repeat(64),
      content: "match all",
      metadata: {
        type: "observation",
        topics: ["topicX"],
        people: ["personY"],
        action_items: [],
        dates_mentioned: [],
      },
    });
    await ctxA.mutation(api.thoughts.createThought, {
      content: fx.content,
      source: fx.source,
      embeddingModel: fx.embeddingModel,
      embeddingDims: fx.embeddingDims,
      fingerprint: fx.fingerprint,
      metadata: fx.metadata,
    });
    const res = await t.fetch("/api/thoughts/list", {
      method: "POST",
      headers: authHeaders(TEST_USER_A),
      body: JSON.stringify({ topic: "topicX", person: "personY", days: 1 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { content: string }[] };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.content).toBe("match all");
  });
});

describe("GET /api/thoughts/stats", () => {
  test("topPeople aggregation returns sorted counts", async () => {
    const t = makeTest();
    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const people = ["alice", "alice", "bob"];
    for (let i = 0; i < people.length; i += 1) {
      const person = people[i] ?? "x";
      const fx = makeThought(TEST_USER_A, {
        fingerprint: `${i}`.repeat(64).slice(0, 64),
        content: `note ${person}`,
        metadata: {
          topics: [],
          people: [person],
          action_items: [],
          dates_mentioned: [],
        },
      });
      await ctxA.mutation(api.thoughts.createThought, {
        content: fx.content,
        source: fx.source,
        embeddingModel: fx.embeddingModel,
        embeddingDims: fx.embeddingDims,
        fingerprint: fx.fingerprint,
        metadata: fx.metadata,
      });
    }
    const res = await t.fetch("/api/thoughts/stats", {
      method: "GET",
      headers: authHeaders(TEST_USER_A),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { topPeople: { name: string; count: number }[] };
    expect(body.topPeople[0]).toEqual({ name: "alice", count: 2 });
    expect(body.topPeople[1]).toEqual({ name: "bob", count: 1 });
  });
});
