import { describe, expect, test } from "bun:test";
import { createConvexClient, type FetchLike } from "../../src/deps/convex";
import { emptyMetadata } from "../helpers/fakes";

interface CapturedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function normalizeHeaders(h: RequestInit["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (h === undefined || h === null) {
    return out;
  }
  if (h instanceof Headers) {
    h.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h) {
      out[k.toLowerCase()] = v;
    }
    return out;
  }
  for (const [k, v] of Object.entries(h)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function recorder(response: { status?: number; json?: unknown }): {
  fetch: FetchLike;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const status = response.status ?? 200;
  const body = JSON.stringify(response.json ?? {});
  const f: FetchLike = (url, init) => {
    const bodyStr = typeof init.body === "string" ? init.body : "";
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: normalizeHeaders(init.headers),
      body: bodyStr === "" ? undefined : JSON.parse(bodyStr),
    });
    return Promise.resolve(
      new Response(body, { status, headers: { "content-type": "application/json" } }),
    );
  };
  return { fetch: f, calls };
}

describe("createConvexClient — trust boundary", () => {
  test("every call sets X-OpenBrains-User-Id and X-OpenBrains-Internal-Secret", async () => {
    const { fetch: f, calls } = recorder({ json: { id: "t_1" } });
    const client = createConvexClient({
      convexUrl: "https://abc.convex.cloud",
      internalSecret: "topsecret",
      fetch: f,
    });
    await client.captureThought({
      userId: "user_42",
      content: "hello",
      source: "cli",
      embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
      embeddingDims: 1024,
      fingerprint: "f".repeat(64),
      metadata: emptyMetadata(),
    });
    expect(calls.length).toBe(1);
    expect(calls[0]?.headers["x-openbrains-user-id"]).toBe("user_42");
    expect(calls[0]?.headers["x-openbrains-internal-secret"]).toBe("topsecret");
    expect(calls[0]?.headers["content-type"]).toBe("application/json");
  });

  test("captureThought posts to /api/thoughts and returns the id", async () => {
    const { fetch: f, calls } = recorder({ json: { id: "t_new" } });
    const client = createConvexClient({
      convexUrl: "https://abc.convex.cloud/",
      internalSecret: "s",
      fetch: f,
    });
    const out = await client.captureThought({
      userId: "u",
      content: "hello",
      source: "cli",
      embeddingModel: "m",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: { topics: ["x"], people: [], action_items: [], dates_mentioned: [] },
    });
    expect(out).toEqual({ id: "t_new" });
    expect(calls[0]?.url).toBe("https://abc.convex.cloud/api/thoughts");
    expect(calls[0]?.method).toBe("POST");
  });

  test("getThoughtsByIds posts ids and returns rows", async () => {
    const row = {
      _id: "t_1",
      userId: "u",
      content: "c",
      source: "s",
      embeddingModel: "m",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
      createdAt: 1,
      updatedAt: 1,
    };
    const { fetch: f, calls } = recorder({ json: { rows: [row] } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    const rows = await client.getThoughtsByIds({ userId: "u", ids: ["t_1"] });
    expect(rows).toEqual([row]);
    expect(calls[0]?.url).toBe("https://x.convex.cloud/api/thoughts/search");
    expect(calls[0]?.body).toEqual({ ids: ["t_1"] });
  });

  test("listThoughts attaches ?limit and uses GET", async () => {
    const { fetch: f, calls } = recorder({ json: { rows: [] } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    await client.listThoughts({ userId: "u", limit: 7 });
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("https://x.convex.cloud/api/thoughts?limit=7");
  });

  test("thoughtStats GET", async () => {
    const { fetch: f, calls } = recorder({
      json: { total: 3, byType: { idea: 2 }, topTopics: [{ topic: "x", count: 2 }] },
    });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    const stats = await client.thoughtStats({ userId: "u" });
    expect(stats.total).toBe(3);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("https://x.convex.cloud/api/thoughts/stats");
  });

  test("memoryWriteback posts origin + content; no trustGrade/scopes leak through (HTTP doesn't accept them)", async () => {
    const { fetch: f, calls } = recorder({ json: { id: "t_w" } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    await client.memoryWriteback({
      userId: "u",
      content: "c",
      source: "agent",
      embeddingModel: "m",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      origin: "agent_inferred",
      trustGrade: "evidence",
      scopes: ["personal"],
      agent: "claude",
      agentVersion: "4.7",
    });
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body["origin"]).toBe("agent_inferred");
    expect(body["agent"]).toBe("claude");
    expect(body["agentVersion"]).toBe("4.7");
    expect(body["content"]).toBe("c");
    expect("trustGrade" in body).toBe(false);
    expect("scopes" in body).toBe(false);
  });

  test("memoryReview posts required fields", async () => {
    const { fetch: f, calls } = recorder({ json: { id: "r_1" } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    await client.memoryReview({
      userId: "u",
      thoughtId: "t_1",
      status: "confirmed",
      reviewer: "u",
      note: "looks good",
    });
    expect(calls[0]?.body).toEqual({
      thoughtId: "t_1",
      status: "confirmed",
      reviewer: "u",
      note: "looks good",
    });
  });

  test("non-2xx status throws", async () => {
    const { fetch: f } = recorder({ status: 401, json: {} });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    await expect(
      client.captureThought({
        userId: "u",
        content: "c",
        source: "s",
        embeddingModel: "m",
        embeddingDims: 1024,
        fingerprint: "a".repeat(64),
        metadata: emptyMetadata(),
      }),
    ).rejects.toThrow(/401/);
  });
});
