import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import { makeTest, TEST_USER_A } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

type FetchFn = typeof globalThis.fetch;

const originalFetch = globalThis.fetch;

function stubFetch(fn: FetchFn): void {
  (globalThis as { fetch: FetchFn }).fetch = fn;
}

async function seedThought(t: ReturnType<typeof makeTest>, userId: string) {
  const fx = makeThought(userId);
  return await t.withIdentity({ subject: userId }).mutation(api.thoughts.createThought, {
    content: fx.content,
    source: fx.source,
    embeddingModel: fx.embeddingModel,
    embeddingDims: fx.embeddingDims,
    fingerprint: fx.fingerprint,
    metadata: fx.metadata,
  });
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    process.env[key] = value;
  }
}

function chatResponse(payload: unknown): Response {
  return new Response(JSON.stringify({ response: JSON.stringify(payload) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("entitiesAction.extractFromThoughtInternal", () => {
  test("skips when DASHBOARD_WORKER_URL is unset", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const prior = process.env["DASHBOARD_WORKER_URL"];
    setEnv("DASHBOARD_WORKER_URL", undefined);
    try {
      const out = await t.action(internal.entitiesAction.extractFromThoughtInternal, {
        userId: TEST_USER_A,
        thoughtId: id,
        content: "hi",
      });
      expect(out.status).toBe("skipped");
    } finally {
      setEnv("DASHBOARD_WORKER_URL", prior);
    }
  });

  test("skips when INTERNAL_API_SECRET is unset", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const priorUrl = process.env["DASHBOARD_WORKER_URL"];
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const priorSecret = process.env["INTERNAL_API_SECRET"];
    setEnv("DASHBOARD_WORKER_URL", "https://ob-dash.example.com");
    setEnv("INTERNAL_API_SECRET", undefined);
    try {
      const out = await t.action(internal.entitiesAction.extractFromThoughtInternal, {
        userId: TEST_USER_A,
        thoughtId: id,
        content: "hi",
      });
      expect(out.status).toBe("skipped");
    } finally {
      setEnv("DASHBOARD_WORKER_URL", priorUrl);
      setEnv("INTERNAL_API_SECRET", priorSecret);
    }
  });

  describe("with the dashboard chat bridge wired", () => {
    let prevUrl: string | undefined;
    let prevSecret: string | undefined;

    beforeEach(() => {
      // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
      prevUrl = process.env["DASHBOARD_WORKER_URL"];
      // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
      prevSecret = process.env["INTERNAL_API_SECRET"];
      setEnv("DASHBOARD_WORKER_URL", "https://ob-dash.example.com");
      setEnv("INTERNAL_API_SECRET", "shh");
    });

    afterEach(() => {
      setEnv("DASHBOARD_WORKER_URL", prevUrl);
      setEnv("INTERNAL_API_SECRET", prevSecret);
      stubFetch(originalFetch);
    });

    test("clears stale mentions+relations before upserting from the new content", async () => {
      const t = makeTest();
      const thoughtId = await seedThought(t, TEST_USER_A);
      const baseFx = makeThought(TEST_USER_A);
      const otherThoughtId = await t
        .withIdentity({ subject: TEST_USER_A })
        .mutation(api.thoughts.createThought, {
          content: "second thought referencing Cloudflare",
          source: baseFx.source,
          embeddingModel: baseFx.embeddingModel,
          embeddingDims: baseFx.embeddingDims,
          fingerprint: "other".padEnd(64, "0").slice(0, 64),
          metadata: baseFx.metadata,
        });

      // Seed: two entities, mentions for both thoughts, and a relation whose
      // evidence covers both thoughts.
      const oldA = await t.mutation(internal.entities.upsertInternal, {
        userId: TEST_USER_A,
        entity: { canonicalName: "OldFrom", kind: "person", aliases: [] },
      });
      const oldB = await t.mutation(internal.entities.upsertInternal, {
        userId: TEST_USER_A,
        entity: { canonicalName: "OldTo", kind: "org", aliases: [] },
      });
      await t.mutation(internal.entities.mentionInternal, {
        userId: TEST_USER_A,
        entityId: oldA,
        thoughtId,
      });
      await t.mutation(internal.entities.mentionInternal, {
        userId: TEST_USER_A,
        entityId: oldA,
        thoughtId: otherThoughtId,
      });
      await t.mutation(internal.entities.relateInternal, {
        userId: TEST_USER_A,
        relation: {
          fromEntityId: oldA,
          toEntityId: oldB,
          kind: "works_at",
          evidenceThoughtIds: [thoughtId, otherThoughtId],
          confidence: 0.6,
        },
      });

      // Stub the chat bridge: the LLM "finds" one new entity and no relations.
      stubFetch(((url: string) => {
        if (url.endsWith("/internal/ai/chat")) {
          return Promise.resolve(
            chatResponse({
              entities: [{ canonicalName: "NewEntity", kind: "topic", aliases: [] }],
              relations: [],
            }),
          );
        }
        return Promise.resolve(new Response("not found", { status: 404 }));
      }) as unknown as FetchFn);

      const out = await t.action(internal.entitiesAction.extractFromThoughtInternal, {
        userId: TEST_USER_A,
        thoughtId,
        content: "edited content mentioning a new entity",
      });
      expect(out.status).toBe("success");

      // Mention for the edited thought against `oldA` is gone…
      const oldAMentions = await t
        .withIdentity({ subject: TEST_USER_A })
        .query(api.entities.mentionsForEntity, { entityId: oldA });
      expect(oldAMentions.map((m) => m.thoughtId)).toEqual([otherThoughtId]);

      // …but the relation's evidence is pruned, not deleted, because the
      // other thought still supports it.
      const { outgoing } = await t
        .withIdentity({ subject: TEST_USER_A })
        .query(api.entities.relationsForEntity, { entityId: oldA });
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0]?.evidenceThoughtIds).toEqual([otherThoughtId]);

      // The new entity from the LLM response is present + mentioned.
      const entities = await t
        .withIdentity({ subject: TEST_USER_A })
        .query(api.entities.listForUser, {});
      const newEntity = entities.find((e) => e.canonicalName === "NewEntity");
      expect(newEntity).toBeDefined();
      if (newEntity !== undefined) {
        const newMentions = await t
          .withIdentity({ subject: TEST_USER_A })
          .query(api.entities.mentionsForEntity, { entityId: newEntity._id });
        expect(newMentions.map((m) => m.thoughtId)).toEqual([thoughtId]);
      }
    });
  });
});
