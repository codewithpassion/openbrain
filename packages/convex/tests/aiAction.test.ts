import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { internal } from "../convex/_generated/api";
import { makeTest } from "./helpers/client";

type FetchFn = typeof globalThis.fetch;

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

describe("aiAction.embedInternal", () => {
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

  test("returns skipped when MCP_WORKER_URL is unset", async () => {
    setEnv("MCP_WORKER_URL", undefined);
    setEnv("INTERNAL_API_SECRET", "shh");
    const t = makeTest();
    const outcome = await t.action(internal.aiAction.embedInternal, { content: "hi" });
    expect(outcome.status).toBe("skipped");
  });

  test("returns skipped when INTERNAL_API_SECRET is unset", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", undefined);
    const t = makeTest();
    const outcome = await t.action(internal.aiAction.embedInternal, { content: "hi" });
    expect(outcome.status).toBe("skipped");
  });

  test("returns success with vector when the Worker route returns data", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", "shh");
    const vec = Array.from({ length: 1024 }, (_, i) => (i % 200) / 1000 - 0.1);
    stubFetch(((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [vec] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )) as FetchFn);
    const t = makeTest();
    const outcome = await t.action(internal.aiAction.embedInternal, { content: "hello" });
    if (outcome.status !== "success") {
      throw new Error(`expected success, got ${outcome.status}`);
    }
    expect(outcome.vector.length).toBe(1024);
    expect(outcome.dimensions).toBe(1024);
  });

  test("returns failure on HTTP error", async () => {
    setEnv("MCP_WORKER_URL", "https://ob-mcp.example.com");
    setEnv("INTERNAL_API_SECRET", "shh");
    stubFetch(((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response("nope", { status: 500 }))) as FetchFn);
    const t = makeTest();
    const outcome = await t.action(internal.aiAction.embedInternal, { content: "hi" });
    expect(outcome.status).toBe("failure");
  });
});
