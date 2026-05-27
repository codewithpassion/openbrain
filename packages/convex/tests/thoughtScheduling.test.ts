/**
 * Verifies that `updateContent` and `deleteThought` queue the right
 * Vectorize-sync actions, and that the public `reembedThought` mutation does
 * the same.
 *
 * Why we inspect `_scheduled_functions` rather than letting the scheduler run:
 * convex-test uses real `setTimeout(0, ...)` for `runAfter(0, ...)`. Without
 * vitest fake timers (Bun's test runtime), `finishInProgressScheduledFunctions`
 * returns immediately because the timer hasn't fired yet, so nothing is "in
 * progress". The actual action behavior is covered end-to-end in
 * `vectorAction.test.ts`; here we only need to assert the queue contents.
 */
import { describe, expect, test } from "bun:test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

interface ScheduledArgs {
  userId?: string;
  thoughtId?: string;
  vectorizeId?: string;
  content?: string;
}

interface ScheduledRow {
  name: string;
  args: readonly unknown[];
}

async function seedThought(
  t: ReturnType<typeof makeTest>,
  userId: string,
): Promise<Id<"thoughts">> {
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

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function listScheduled(
  t: ReturnType<typeof makeTest>,
  name: string,
): Promise<ScheduledRow[]> {
  const rows = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return rows
    .filter((r) => r.name === name)
    .map((r) => ({ name: r.name, args: r.args as readonly unknown[] }));
}

function firstArgs(row: ScheduledRow): ScheduledArgs {
  const a = row.args[0];
  if (a === null || typeof a !== "object") {
    throw new Error("scheduled function args missing");
  }
  return a as ScheduledArgs;
}

describe("thoughts.updateContent scheduling", () => {
  test("queues reembedInternal after a content edit", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    const newContent = "updated content for reindex";
    const fingerprint = await sha256Hex(newContent);

    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.updateContent, {
      id,
      content: newContent,
      fingerprint,
      metadata: { topics: ["alpha"], people: [], action_items: [], dates_mentioned: [] },
    });

    const queued = await listScheduled(t, "thoughtsAction:reembedInternal");
    expect(queued.length).toBe(1);
    const args = firstArgs(queued[0] as ScheduledRow);
    expect(args.userId).toBe(TEST_USER_A);
    expect(args.thoughtId).toBe(id);
  });

  test("queues entity re-extraction with the new content after a content edit", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    const newContent = "edited content mentions Cloudflare";
    const fingerprint = await sha256Hex(newContent);

    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.updateContent, {
      id,
      content: newContent,
      fingerprint,
      metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
    });

    // Seed scheduled one extraction with the original content; the edit must
    // schedule a second with the new content.
    const queued = await listScheduled(t, "entitiesAction:extractFromThoughtInternal");
    expect(queued.length).toBe(2);
    const editArgs = queued.map((q) => firstArgs(q)).find((a) => a.content === newContent);
    expect(editArgs).toBeDefined();
    expect(editArgs?.userId).toBe(TEST_USER_A);
    expect(editArgs?.thoughtId).toBe(id);
  });
});

describe("thoughts.deleteThought scheduling", () => {
  test("queues a vector delete with the thoughtId as fallback vectorizeId", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);

    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.deleteThought, { id });

    const queued = await listScheduled(t, "thoughtsAction:deleteVectorInternal");
    expect(queued.length).toBe(1);
    const args = firstArgs(queued[0] as ScheduledRow);
    expect(args.userId).toBe(TEST_USER_A);
    expect(args.vectorizeId).toBe(id);
  });

  test("uses row.vectorizeId when present", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { vectorizeId: "custom_vec_id" });
    });

    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.deleteThought, { id });

    const queued = await listScheduled(t, "thoughtsAction:deleteVectorInternal");
    expect(queued.length).toBe(1);
    const args = firstArgs(queued[0] as ScheduledRow);
    expect(args.vectorizeId).toBe("custom_vec_id");
  });
});

describe("thoughts.createThought scheduling", () => {
  test("queues entity extraction with the new thought's id and content", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);

    const queued = await listScheduled(t, "entitiesAction:extractFromThoughtInternal");
    expect(queued.length).toBe(1);
    const args = firstArgs(queued[0] as ScheduledRow);
    expect(args.userId).toBe(TEST_USER_A);
    expect(args.thoughtId).toBe(id);
    expect(args.content).toBe(makeThought(TEST_USER_A).content);
  });
});

describe("thoughts.reembedThought public mutation", () => {
  test("queues reembedInternal for the caller's thought", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);

    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.reembedThought, { id });

    const queued = await listScheduled(t, "thoughtsAction:reembedInternal");
    expect(queued.length).toBe(1);
    const args = firstArgs(queued[0] as ScheduledRow);
    expect(args.userId).toBe(TEST_USER_A);
    expect(args.thoughtId).toBe(id);
  });

  test("refuses cross-tenant thought ids", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await expect(
      t.withIdentity({ subject: TEST_USER_B }).mutation(api.thoughts.reembedThought, { id }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("requires authentication", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await expect(t.mutation(api.thoughts.reembedThought, { id })).rejects.toThrow();
  });
});
