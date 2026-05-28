import { describe, expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

/**
 * Seed a thought via the public mutation as user `userId`. Returns the new
 * thought id. Centralizes the verbose argument-passing the convex-test API
 * requires.
 */
async function seedThought(
  t: ReturnType<typeof makeTest>,
  userId: string,
  overrides: { content?: string; fingerprint?: string; type?: string } = {},
) {
  const fx = makeThought(userId);
  const metadata: typeof fx.metadata = { ...fx.metadata };
  if (overrides.type !== undefined) {
    metadata.type = overrides.type;
  }
  return await t.withIdentity({ subject: userId }).mutation(api.thoughts.createThought, {
    content: overrides.content ?? fx.content,
    source: fx.source,
    embeddingModel: fx.embeddingModel,
    embeddingDims: fx.embeddingDims,
    fingerprint: (overrides.fingerprint ?? fx.fingerprint).padEnd(64, "0").slice(0, 64),
    metadata,
  });
}

describe("thoughts.setTypeInternal", () => {
  test("patches metadata.type on the caller's thought and audits", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await t.mutation(internal.thoughts.setTypeInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
      type: "idea",
    });
    const got = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.getThought, { id });
    expect(got?.metadata.type).toBe("idea");
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "thought.setType")).toBe(true);
  });

  test("refuses cross-tenant thought ids", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(internal.thoughts.setTypeInternal, {
        userId: TEST_USER_B,
        thoughtId: id,
        type: "idea",
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  test("no-op when metadata.type is already set", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A, { type: "task" });
    const result = await t.mutation(internal.thoughts.setTypeInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
      type: "idea",
    });
    expect(result).toBe(false);
    const got = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.getThought, { id });
    expect(got?.metadata.type).toBe("task");
  });
});

describe("thoughts.mergeMetadataInternal", () => {
  test("fills empty fields without overwriting existing data", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    // Seed with some existing topics; the merge should keep them and add new.
    await t.run(async (ctx) => {
      const row = await ctx.db.get(id);
      if (row === null) {
        throw new Error("seed thought missing");
      }
      await ctx.db.patch(id, {
        metadata: { ...row.metadata, topics: ["alpha"] },
      });
    });
    await t.mutation(internal.thoughts.mergeMetadataInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
      metadata: {
        type: "idea",
        topics: ["alpha", "beta"],
        people: ["alice"],
        action_items: ["do thing"],
        dates_mentioned: [],
      },
    });
    const got = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.getThought, { id });
    expect(got?.metadata.type).toBe("idea");
    expect(got?.metadata.topics).toEqual(["alpha", "beta"]);
    expect(got?.metadata.people).toEqual(["alice"]);
    expect(got?.metadata.action_items).toEqual(["do thing"]);
  });

  test("refuses cross-tenant access", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(internal.thoughts.mergeMetadataInternal, {
        userId: TEST_USER_B,
        thoughtId: id,
        metadata: {
          topics: [],
          people: [],
          action_items: [],
          dates_mentioned: [],
        },
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("thoughts.persistSplitInternal", () => {
  test("creates child thoughts linked to the parent via parentThoughtId", async () => {
    const t = makeTest();
    const parent = await seedThought(t, TEST_USER_A, {
      content: "buy milk; ship the feature; reply to alice",
      fingerprint: "parent",
    });
    const ideas = [
      { content: "buy milk", topics: ["errands"] },
      { content: "ship the feature", type: "task" as const, topics: ["work"] },
      { content: "reply to alice", topics: [] },
    ];
    const result = await t.mutation(internal.thoughts.persistSplitInternal, {
      userId: TEST_USER_A,
      parentThoughtId: parent,
      ideas,
    });
    expect(result.created).toBe(3);
    const children = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.childrenOfThought, { parentThoughtId: parent });
    expect(children).toHaveLength(3);
    const contents = children.map((c) => c.content).sort();
    expect(contents).toEqual(["buy milk", "reply to alice", "ship the feature"]);
    // The "ship the feature" child should carry the type from the splitter.
    const ship = children.find((c) => c.content === "ship the feature");
    expect(ship?.metadata.type).toBe("task");
  });

  test("is idempotent: re-running with the same ideas doesn't duplicate", async () => {
    const t = makeTest();
    const parent = await seedThought(t, TEST_USER_A, { fingerprint: "parent-2" });
    const ideas = [{ content: "alpha", topics: ["x"] }];
    await t.mutation(internal.thoughts.persistSplitInternal, {
      userId: TEST_USER_A,
      parentThoughtId: parent,
      ideas,
    });
    const second = await t.mutation(internal.thoughts.persistSplitInternal, {
      userId: TEST_USER_A,
      parentThoughtId: parent,
      ideas,
    });
    expect(second.created).toBe(0);
    const children = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.childrenOfThought, { parentThoughtId: parent });
    expect(children).toHaveLength(1);
  });

  test("refuses cross-tenant parent ids", async () => {
    const t = makeTest();
    const parent = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(internal.thoughts.persistSplitInternal, {
        userId: TEST_USER_B,
        parentThoughtId: parent,
        ideas: [{ content: "stolen", topics: [] }],
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("thoughtsAction internal actions", () => {
  function setEnv(key: string, value: string | undefined): void {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }

  function withEnvCleared<T>(keys: readonly string[], fn: () => Promise<T>): Promise<T> {
    const prior = new Map<string, string | undefined>();
    for (const k of keys) {
      prior.set(k, process.env[k]);
      setEnv(k, undefined);
    }
    return fn().finally(() => {
      for (const [k, v] of prior) {
        setEnv(k, v);
      }
    });
  }

  async function jobRuns(t: ReturnType<typeof makeTest>, name: string) {
    return await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.jobs.listForUser, { limit: 50 })
      .then((rows) => rows.filter((r) => r.name === name));
  }

  test("classifyOnCaptureInternal skips + records job_run when DASHBOARD_WORKER_URL is unset", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await withEnvCleared(["DASHBOARD_WORKER_URL"], async () => {
      const out = await t.action(internal.thoughtsAction.classifyOnCaptureInternal, {
        userId: TEST_USER_A,
        thoughtId: id,
      });
      expect(out.status).toBe("skipped");
      const runs = await jobRuns(t, "thoughts.classify");
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("skipped");
    });
  });

  test("classifyOnCaptureInternal noop records job_run as success with note", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A, { type: "idea" });
    setEnv("DASHBOARD_WORKER_URL", "https://ob-dash.example.com");
    setEnv("INTERNAL_API_SECRET", "fake-secret");
    try {
      const out = await t.action(internal.thoughtsAction.classifyOnCaptureInternal, {
        userId: TEST_USER_A,
        thoughtId: id,
      });
      expect(out.status).toBe("noop");
      const runs = await jobRuns(t, "thoughts.classify");
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("success");
      expect(runs[0]?.note).toContain("noop");
    } finally {
      setEnv("DASHBOARD_WORKER_URL", undefined);
      setEnv("INTERNAL_API_SECRET", undefined);
    }
  });

  test("enrichThoughtInternal skips + records job_run when env missing", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await withEnvCleared(["DASHBOARD_WORKER_URL"], async () => {
      const out = await t.action(internal.thoughtsAction.enrichThoughtInternal, {
        userId: TEST_USER_A,
        thoughtId: id,
      });
      expect(out.status).toBe("skipped");
      const runs = await jobRuns(t, "thoughts.enrich");
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("skipped");
    });
  });

  test("splitBrainDumpInternal skips + records job_run when env missing", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A, { content: "dump" });
    await withEnvCleared(["DASHBOARD_WORKER_URL"], async () => {
      const out = await t.action(internal.thoughtsAction.splitBrainDumpInternal, {
        userId: TEST_USER_A,
        parentThoughtId: id,
        maxIdeas: 3,
      });
      expect(out.status).toBe("skipped");
      const runs = await jobRuns(t, "thoughts.split");
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("skipped");
    });
  });
});
