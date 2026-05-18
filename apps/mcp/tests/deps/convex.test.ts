import { describe, expect, test } from "bun:test";
import {
  ConvexReviewRequiredError,
  createConvexClient,
  type FetchLike,
} from "../../src/deps/convex";
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

function makeRow(over?: { _id?: string; userId?: string; fingerprint?: string }) {
  return {
    _id: over?._id ?? "t_1",
    userId: over?.userId ?? "u",
    content: "c",
    source: "cli",
    embeddingModel: "m",
    embeddingDims: 1024,
    fingerprint: over?.fingerprint ?? "a".repeat(64),
    metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
    createdAt: 1,
    updatedAt: 1,
  };
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

  test("getByFingerprint returns the full thought row, or null", async () => {
    // Hit case.
    const row = makeRow({ fingerprint: "f".repeat(64) });
    const hit = recorder({ json: { thought: row } });
    const clientHit = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: hit.fetch,
    });
    const thought = await clientHit.getByFingerprint({ userId: "u", fingerprint: "f".repeat(64) });
    expect(thought?._id).toBe("t_1");
    expect(thought?.userId).toBe("u");
    expect(hit.calls[0]?.url).toBe("https://x.convex.cloud/api/thoughts/by-fingerprint");
    expect(hit.calls[0]?.body).toEqual({ fingerprint: "f".repeat(64) });

    // Miss case.
    const miss = recorder({ json: { thought: null } });
    const clientMiss = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: miss.fetch,
    });
    const out = await clientMiss.getByFingerprint({ userId: "u", fingerprint: "f".repeat(64) });
    expect(out).toBeNull();
  });

  test("getThoughtsByIds posts ids and returns rows", async () => {
    const row = makeRow();
    const { fetch: f, calls } = recorder({ json: { rows: [row] } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    const rows = await client.getThoughtsByIds({ userId: "u", ids: ["t_1"] });
    expect(rows[0]?._id).toBe("t_1");
    expect(calls[0]?.url).toBe("https://x.convex.cloud/api/thoughts/search");
    expect(calls[0]?.body).toEqual({ ids: ["t_1"] });
  });

  test("listThoughts POSTs filter pushdown to /api/thoughts/list", async () => {
    const { fetch: f, calls } = recorder({ json: { rows: [] } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    await client.listThoughts({
      userId: "u",
      limit: 7,
      type: "idea",
      topic: "work",
      person: "alice",
      days: 14,
    });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://x.convex.cloud/api/thoughts/list");
    expect(calls[0]?.body).toEqual({
      limit: 7,
      type: "idea",
      topic: "work",
      person: "alice",
      days: 14,
    });
  });

  test("listThoughts omits absent optional filters from body", async () => {
    const { fetch: f, calls } = recorder({ json: { rows: [] } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    await client.listThoughts({ userId: "u" });
    expect(calls[0]?.body).toEqual({});
  });

  test("thoughtStats GETs and parses topPeople with `name`", async () => {
    const { fetch: f, calls } = recorder({
      json: {
        total: 3,
        byType: { idea: 2 },
        topTopics: [{ topic: "x", count: 2 }],
        topPeople: [{ name: "alice", count: 2 }],
      },
    });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    const stats = await client.thoughtStats({ userId: "u" });
    expect(stats.total).toBe(3);
    expect(stats.topPeople[0]).toEqual({ name: "alice", count: 2 });
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("https://x.convex.cloud/api/thoughts/stats");
  });

  test("memoryRecall posts thoughtIds + query + scores", async () => {
    const row = makeRow();
    const { fetch: f, calls } = recorder({
      json: {
        items: [
          {
            thought: row,
            provenance: null,
            usePolicy: null,
          },
        ],
      },
    });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    const out = await client.memoryRecall({
      userId: "u",
      thoughtIds: ["t_1"],
      query: "q",
      scores: [0.9],
    });
    expect(out.items.length).toBe(1);
    expect(out.items[0]?.thought._id).toBe("t_1");
    expect(calls[0]?.url).toBe("https://x.convex.cloud/api/memory/recall");
    expect(calls[0]?.body).toEqual({ thoughtIds: ["t_1"], query: "q", scores: [0.9] });
  });

  test("memoryWriteback nests provenance, omits trustGrade, returns {thoughtId}", async () => {
    const { fetch: f, calls } = recorder({ json: { thoughtId: "t_w" } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    const out = await client.memoryWriteback({
      userId: "u",
      content: "c",
      source: "agent",
      embeddingModel: "m",
      embeddingDims: 1024,
      fingerprint: "a".repeat(64),
      metadata: emptyMetadata(),
      provenance: { origin: "agent_inferred", agent: "claude", agentVersion: "4.7" },
      scopes: ["personal"],
    });
    expect(out).toEqual({ thoughtId: "t_w" });
    const body = calls[0]?.body as {
      provenance: { origin: string; agent?: string; agentVersion?: string };
      scopes: readonly string[];
    };
    expect(body.provenance).toEqual({
      origin: "agent_inferred",
      agent: "claude",
      agentVersion: "4.7",
    });
    expect(body.scopes).toEqual(["personal"]);
    expect("trustGrade" in body).toBe(false);
  });

  test("memoryReview posts required fields and returns {reviewId, promoted}", async () => {
    const { fetch: f, calls } = recorder({ json: { reviewId: "r_1", promoted: true } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    const out = await client.memoryReview({
      userId: "u",
      thoughtId: "t_1",
      status: "confirmed",
      promoteTo: "instruction",
      note: "looks good",
    });
    expect(out).toEqual({ reviewId: "r_1", promoted: true });
    expect(calls[0]?.body).toEqual({
      thoughtId: "t_1",
      status: "confirmed",
      promoteTo: "instruction",
      note: "looks good",
    });
  });

  test("memoryReview 422 REQUIRES_REVIEW maps to a typed error", async () => {
    const { fetch: f } = recorder({ status: 422, json: { error: "REQUIRES_REVIEW" } });
    const client = createConvexClient({
      convexUrl: "https://x.convex.cloud",
      internalSecret: "s",
      fetch: f,
    });
    await expect(
      client.memoryReview({
        userId: "u",
        thoughtId: "t_1",
        status: "needs_revision",
        promoteTo: "instruction",
      }),
    ).rejects.toBeInstanceOf(ConvexReviewRequiredError);
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
