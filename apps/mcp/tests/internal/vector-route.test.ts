import { describe, expect, test } from "bun:test";
import {
  handleVectorDeleteRequest,
  handleVectorUpsertRequest,
  INTERNAL_VECTOR_DELETE_PATH,
  INTERNAL_VECTOR_UPSERT_PATH,
} from "../../src/internal/vector-route";
import { type FakeVectorize, makeFakeVectorize } from "../helpers/fakes";

interface FakeEnv {
  VECTORIZE: FakeVectorize;
  INTERNAL_API_SECRET: string;
}

function makeEnv(secret: string): FakeEnv {
  return { VECTORIZE: makeFakeVectorize(), INTERNAL_API_SECRET: secret };
}

function makeRequest(
  path: string,
  opts: { method?: string; secret?: string; body?: unknown },
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.secret !== undefined) {
    headers["x-openbrains-internal-secret"] = opts.secret;
  }
  const init: RequestInit = { method: opts.method ?? "POST", headers };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return new Request(`https://ob-mcp.example.com${path}`, init);
}

describe("internal vector upsert route", () => {
  test("upserts with namespace = userId and metadata", async () => {
    const env = makeEnv("s");
    const values = Array.from({ length: 1024 }, (_, i) => i / 2048);
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, {
        secret: "s",
        body: {
          userId: "user_abc",
          id: "t_001",
          values,
          metadata: { source: "dashboard", type: "note" },
        },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const calls = env.VECTORIZE.upsertCalls;
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (call === undefined) {
      throw new Error("no upsert call recorded");
    }
    expect(call.id).toBe("t_001");
    expect(call.namespace).toBe("user_abc");
    expect(call.values.length).toBe(1024);
    expect(call.metadata).toEqual({ source: "dashboard", type: "note" });
  });

  test("upsert without optional type only sets source", async () => {
    const env = makeEnv("s");
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, {
        secret: "s",
        body: {
          userId: "user_abc",
          id: "t_002",
          values: [0.1, 0.2],
          metadata: { source: "cli" },
        },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const call = env.VECTORIZE.upsertCalls[0];
    if (call === undefined) {
      throw new Error("no upsert call recorded");
    }
    expect(call.metadata).toEqual({ source: "cli" });
  });

  test("401 when secret missing", async () => {
    const env = makeEnv("s");
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, {
        body: { userId: "u", id: "i", values: [0.1], metadata: { source: "x" } },
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("401 when secret wrong", async () => {
    const env = makeEnv("s");
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, {
        secret: "nope",
        body: { userId: "u", id: "i", values: [0.1], metadata: { source: "x" } },
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("400 when body missing userId", async () => {
    const env = makeEnv("s");
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, {
        secret: "s",
        body: { id: "i", values: [0.1], metadata: { source: "x" } },
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("400 when values is empty", async () => {
    const env = makeEnv("s");
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, {
        secret: "s",
        body: { userId: "u", id: "i", values: [], metadata: { source: "x" } },
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("400 when metadata.source missing", async () => {
    const env = makeEnv("s");
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, {
        secret: "s",
        body: { userId: "u", id: "i", values: [0.1], metadata: {} },
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("405 for non-POST", async () => {
    const env = makeEnv("s");
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, { method: "GET", secret: "s" }),
      env,
    );
    expect(res.status).toBe(405);
  });

  test("500 when INTERNAL_API_SECRET is empty", async () => {
    const env = makeEnv("");
    const res = await handleVectorUpsertRequest(
      makeRequest(INTERNAL_VECTOR_UPSERT_PATH, {
        secret: "s",
        body: { userId: "u", id: "i", values: [0.1], metadata: { source: "x" } },
      }),
      env,
    );
    expect(res.status).toBe(500);
  });
});

describe("internal vector delete route", () => {
  test("deletes by id and returns 200", async () => {
    const env = makeEnv("s");
    const res = await handleVectorDeleteRequest(
      makeRequest(INTERNAL_VECTOR_DELETE_PATH, {
        secret: "s",
        body: { userId: "user_abc", id: "t_001" },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const calls = env.VECTORIZE.deleteCalls;
    expect(calls.length).toBe(1);
    expect(calls[0]?.ids).toEqual(["t_001"]);
  });

  test("401 when secret missing", async () => {
    const env = makeEnv("s");
    const res = await handleVectorDeleteRequest(
      makeRequest(INTERNAL_VECTOR_DELETE_PATH, { body: { userId: "u", id: "i" } }),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("400 when id missing", async () => {
    const env = makeEnv("s");
    const res = await handleVectorDeleteRequest(
      makeRequest(INTERNAL_VECTOR_DELETE_PATH, {
        secret: "s",
        body: { userId: "u" },
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("400 when userId missing", async () => {
    const env = makeEnv("s");
    const res = await handleVectorDeleteRequest(
      makeRequest(INTERNAL_VECTOR_DELETE_PATH, {
        secret: "s",
        body: { id: "i" },
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("405 for non-POST", async () => {
    const env = makeEnv("s");
    const res = await handleVectorDeleteRequest(
      makeRequest(INTERNAL_VECTOR_DELETE_PATH, { method: "GET", secret: "s" }),
      env,
    );
    expect(res.status).toBe(405);
  });

  test("500 when INTERNAL_API_SECRET is empty", async () => {
    const env = makeEnv("");
    const res = await handleVectorDeleteRequest(
      makeRequest(INTERNAL_VECTOR_DELETE_PATH, {
        secret: "s",
        body: { userId: "u", id: "i" },
      }),
      env,
    );
    expect(res.status).toBe(500);
  });
});
