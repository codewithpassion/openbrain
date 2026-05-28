import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { makeTest, TEST_USER_A, TEST_USER_B } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

type FetchFn = typeof globalThis.fetch;
type Recorded = { url: string; init: RequestInit | undefined };

const originalFetch = globalThis.fetch;

function stubFetch(fn: FetchFn): void {
  (globalThis as { fetch: FetchFn }).fetch = fn;
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    process.env[key] = value;
  }
}

function recordingStub(responder: (url: string) => Response): {
  fetch: FetchFn;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fn: FetchFn = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(responder(url));
  }) as FetchFn;
  return { fetch: fn, calls };
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

describe("thoughts.setEmbeddingInternal", () => {
  test("patches embeddingModel/dims/vectorizeId and writes audit", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await t.mutation(internal.thoughts.setEmbeddingInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
      embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
      embeddingDims: 1024,
      vectorizeId: id,
    });
    const got = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.getThought, { id });
    expect(got?.embeddingModel).toBe("@cf/qwen/qwen3-embedding-0.6b");
    expect(got?.embeddingDims).toBe(1024);
    expect(got?.vectorizeId).toBe(id);
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("memory_audit")
        .withIndex("by_user_at", (q) => q.eq("userId", TEST_USER_A))
        .collect(),
    );
    expect(audits.some((a) => a.action === "thought.reembed")).toBe(true);
  });

  test("refuses cross-tenant thought ids", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await expect(
      t.mutation(internal.thoughts.setEmbeddingInternal, {
        userId: TEST_USER_B,
        thoughtId: id,
        embeddingModel: "m",
        embeddingDims: 1024,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

async function jobRuns(t: ReturnType<typeof makeTest>, name: string) {
  return await t
    .withIdentity({ subject: TEST_USER_A })
    .query(api.jobs.listForUser, { limit: 50 })
    .then((rows) => rows.filter((r) => r.name === name));
}

describe("thoughtsAction.reembedInternal", () => {
  let prevMcpUrl: string | undefined;
  let prevSecret: string | undefined;

  beforeEach(() => {
    prevMcpUrl = process.env["MCP_WORKER_URL"];
    prevSecret = process.env["INTERNAL_API_SECRET"];
  });

  afterEach(() => {
    setEnv("MCP_WORKER_URL", prevMcpUrl);
    setEnv("INTERNAL_API_SECRET", prevSecret);
    stubFetch(originalFetch);
  });

  test("returns skipped + records job_run when MCP_WORKER_URL is unset", async () => {
    setEnv("MCP_WORKER_URL", undefined);
    setEnv("INTERNAL_API_SECRET", "shh");
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    const out = await t.action(internal.thoughtsAction.reembedInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
    });
    expect(out.status).toBe("skipped");
    const runs = await jobRuns(t, "thoughts.reembed");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("skipped");
  });

  test("returns skipped when INTERNAL_API_SECRET is unset", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", undefined);
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    const out = await t.action(internal.thoughtsAction.reembedInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
    });
    expect(out.status).toBe("skipped");
  });

  test("returns failure when thought missing", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", "shh");
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    await t.run(async (ctx) => {
      await ctx.db.delete(id);
    });
    const out = await t.action(internal.thoughtsAction.reembedInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
    });
    expect(out.status).toBe("failure");
  });

  test("happy path: embeds, upserts vector, patches row", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", "shh");
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    const vec = Array.from({ length: 1024 }, (_, i) => (i % 200) / 1000 - 0.1);
    const stub = recordingStub((url) => {
      if (url.endsWith("/internal/ai/run")) {
        return new Response(JSON.stringify({ data: [vec] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/internal/vector/upsert")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    });
    stubFetch(stub.fetch);

    const out = await t.action(internal.thoughtsAction.reembedInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
    });
    if (out.status !== "success") {
      throw new Error(`expected success, got ${out.status}`);
    }
    expect(out.dimensions).toBe(1024);

    // Worker received both calls.
    const urls = stub.calls.map((c) => c.url);
    expect(urls.some((u) => u.endsWith("/internal/ai/run"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/internal/vector/upsert"))).toBe(true);

    // Row patched.
    const got = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.thoughts.getThought, { id });
    expect(got?.embeddingModel).toBe("@cf/qwen/qwen3-embedding-0.6b");
    expect(got?.embeddingDims).toBe(1024);
    expect(got?.vectorizeId).toBe(id);
  });

  test("returns failure when embedding HTTP call fails", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", "shh");
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    stubFetch(((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response("nope", { status: 500 }))) as FetchFn);
    const out = await t.action(internal.thoughtsAction.reembedInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
    });
    expect(out.status).toBe("failure");
  });

  test("returns failure when vector upsert HTTP call fails", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", "shh");
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    const vec = Array.from({ length: 1024 }, () => 0.1);
    stubFetch(((url: string, _init?: RequestInit) => {
      if (typeof url === "string" && url.endsWith("/internal/ai/run")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [vec] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 500 }));
    }) as FetchFn);
    const out = await t.action(internal.thoughtsAction.reembedInternal, {
      userId: TEST_USER_A,
      thoughtId: id,
    });
    expect(out.status).toBe("failure");
  });
});

describe("thoughtsAction.deleteVectorInternal", () => {
  let prevMcpUrl: string | undefined;
  let prevSecret: string | undefined;

  beforeEach(() => {
    prevMcpUrl = process.env["MCP_WORKER_URL"];
    prevSecret = process.env["INTERNAL_API_SECRET"];
  });

  afterEach(() => {
    setEnv("MCP_WORKER_URL", prevMcpUrl);
    setEnv("INTERNAL_API_SECRET", prevSecret);
    stubFetch(originalFetch);
  });

  test("returns skipped + records job_run when MCP_WORKER_URL is unset", async () => {
    setEnv("MCP_WORKER_URL", undefined);
    setEnv("INTERNAL_API_SECRET", "shh");
    const t = makeTest();
    const out = await t.action(internal.thoughtsAction.deleteVectorInternal, {
      userId: TEST_USER_A,
      vectorizeId: "vec_001",
    });
    expect(out.status).toBe("skipped");
    const runs = await jobRuns(t, "thoughts.deleteVector");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("skipped");
  });

  test("happy path: returns success and posts to /internal/vector/delete", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", "shh");
    const stub = recordingStub(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    stubFetch(stub.fetch);
    const t = makeTest();
    const out = await t.action(internal.thoughtsAction.deleteVectorInternal, {
      userId: TEST_USER_A,
      vectorizeId: "vec_001",
    });
    expect(out.status).toBe("success");
    expect(stub.calls.length).toBe(1);
    const url = stub.calls[0]?.url ?? "";
    expect(url.endsWith("/internal/vector/delete")).toBe(true);
    const body = stub.calls[0]?.init?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toEqual({
      userId: TEST_USER_A,
      id: "vec_001",
    });
  });

  test("returns failure on HTTP error", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", "shh");
    stubFetch(((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 500 }))) as FetchFn);
    const t = makeTest();
    const out = await t.action(internal.thoughtsAction.deleteVectorInternal, {
      userId: TEST_USER_A,
      vectorizeId: "vec_001",
    });
    expect(out.status).toBe("failure");
  });
});
