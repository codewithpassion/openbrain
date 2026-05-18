/**
 * Internal-only writeback. Asserts the single internal mutation called by
 * `POST /api/memory/writeback` writes thought + provenance + use_policy
 * atomically, always at trustGrade="evidence" (CLAUDE.md §7).
 */
import { describe, expect, test } from "bun:test";
import { api, internal } from "../../convex/_generated/api";
import { makeTest, TEST_USER_A } from "../helpers/client";

function baseArgs(fingerprint: string): {
  userId: string;
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: {
    topics: string[];
    people: string[];
    action_items: string[];
    dates_mentioned: string[];
  };
} {
  return {
    userId: TEST_USER_A,
    content: "agent-inferred memo",
    source: "mcp",
    embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
    embeddingDims: 1024,
    fingerprint,
    metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
  };
}

describe("memory/writeback (internal)", () => {
  test("creates thought + provenance + use-policy in one mutation", async () => {
    const t = makeTest();
    const { thoughtId } = await t.mutation(internal.memory.writeback.writebackInternal, {
      ...baseArgs("a".repeat(64)),
      provenance: { origin: "agent_inferred", agent: "claude", sessionId: "s1" },
      scopes: ["personal"],
    });
    expect(thoughtId).toBeTruthy();

    const ctxA = t.withIdentity({ subject: TEST_USER_A });
    const policy = await ctxA.query(api.memory.usePolicy.get, { thoughtId });
    expect(policy?.trustGrade).toBe("evidence");
    expect(policy?.scopes).toEqual(["personal"]);

    const prov = await ctxA.query(api.memory.provenance.list, { thoughtId });
    expect(prov).toHaveLength(1);
    expect(prov[0]?.origin).toBe("agent_inferred");
    expect(prov[0]?.agent).toBe("claude");
    expect(prov[0]?.sessionId).toBe("s1");
  });

  test("trustGrade is always evidence (no input field honored)", async () => {
    const t = makeTest();
    // The internal mutation's validator has no `trustGrade` field at all —
    // proven by both the absence of a corresponding arg and the fact that the
    // resulting policy row always reads evidence.
    const { thoughtId } = await t.mutation(internal.memory.writeback.writebackInternal, {
      ...baseArgs("b".repeat(64)),
      provenance: { origin: "agent_generated" },
      scopes: [],
    });
    const policy = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.memory.usePolicy.get, { thoughtId });
    expect(policy?.trustGrade).toBe("evidence");
  });

  test("writes audit rows for thought.create + provenance.record + usePolicy.upsert", async () => {
    const t = makeTest();
    await t.mutation(internal.memory.writeback.writebackInternal, {
      ...baseArgs("c".repeat(64)),
      provenance: { origin: "agent_inferred" },
      scopes: [],
    });
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
