import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { signDeviceToken } from "../../src/auth/device-token";

/**
 * Goal of this test: prove that `ctx.props.userId` set by the OAuth provider's
 * token-resolution callback actually reaches the MCP tool envelope (the
 * `auth` argument passed to `buildServer({ deps, auth })` and read by each
 * tool).
 *
 * Path exercised:
 *   1. We sign a device-flow bearer (`obdev_...`) directly using the same
 *      HMAC secret the Worker has configured.
 *   2. We POST that bearer to `/mcp` with an MCP `initialize` + `tools/call`
 *      sequence via `SELF.fetch` (Miniflare).
 *   3. The Worker's `resolveExternalToken` callback verifies the bearer and
 *      surfaces `{ userId, email }` as `ctx.props`. `mcpApiHandler` reads
 *      them and threads them into the per-tool auth context.
 *   4. The `thought_stats` tool consults `auth.userId` and emits a Convex
 *      HTTP call carrying it in the `X-OpenBrains-User-Id` header. We stub
 *      the global `fetch` to capture that header and return a canned stats
 *      response — then assert the userId we minted into the bearer is what
 *      the tool actually saw.
 *
 * This is the "Best way" the task spec describes: a fake (here: stubbed
 * global fetch) catches the outbound Convex request and echoes the userId
 * back, proving end-to-end propagation through OAuthProvider → ctx.props →
 * apiHandler → tool envelope → Convex client.
 */

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DEVICE_FLOW_SECRET: string;
    CONVEX_URL: string;
  }
}

const TEST_USER_ID = "user_test_abc";

async function mintTestBearer(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await signDeviceToken(env.DEVICE_FLOW_SECRET, {
    userId: TEST_USER_ID,
    email: "integration@example.com",
    scope: ["openid", "email"],
    iat: now,
    exp: now + 3600,
  });
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: { content?: readonly { type: string; text: string }[] };
  error?: { code: number; message: string };
}

function parseRpcPayload(text: string): JsonRpcResponse {
  if (text.startsWith("event:") || text.includes("\ndata:") || text.startsWith("data:")) {
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        return JSON.parse(line.slice("data:".length).trim()) as JsonRpcResponse;
      }
    }
    throw new Error("no data line in SSE payload");
  }
  return JSON.parse(text) as JsonRpcResponse;
}

async function mcpCall(
  bearer: string,
  body: Record<string, unknown>,
  init?: { sessionId?: string },
): Promise<{ response: Response; json: JsonRpcResponse; sessionId: string | null }> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (init?.sessionId !== undefined) {
    headers["mcp-session-id"] = init.sessionId;
  }
  const response = await SELF.fetch("https://example.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    response,
    json: parseRpcPayload(text),
    sessionId: response.headers.get("mcp-session-id"),
  };
}

interface CapturedConvexCall {
  url: string;
  userIdHeader: string | null;
  internalSecretHeader: string | null;
}

describe("OAuth prop propagation through MCP", () => {
  let capturedConvex: CapturedConvexCall[];
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    capturedConvex = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith(env.CONVEX_URL)) {
        const reqHeaders = new Headers(init?.headers);
        capturedConvex.push({
          url,
          userIdHeader: reqHeaders.get("x-openbrains-user-id"),
          internalSecretHeader: reqHeaders.get("x-openbrains-internal-secret"),
        });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              total: 0,
              byType: {},
              topTopics: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return realFetch(input, init);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns 401 without a bearer", async () => {
    const response = await SELF.fetch("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(response.status).toBe(401);
  });

  test("device-flow bearer threads userId into the tool envelope", async () => {
    const bearer = await mintTestBearer();

    // 1) initialize
    const initResult = await mcpCall(bearer, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "integration", version: "0.0.0" },
      },
    });
    expect(initResult.response.status).toBe(200);
    expect(initResult.json.error).toBeUndefined();
    const sessionOpts =
      initResult.sessionId === null ? undefined : { sessionId: initResult.sessionId };

    // 2) tools/call thought_stats — empty args, so a successful tool call
    //    means the bearer was accepted, ctx.props.userId was non-empty, and
    //    auth.userId reached the tool.
    const callResult = await mcpCall(
      bearer,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "thought_stats", arguments: {} },
      },
      sessionOpts,
    );
    expect(callResult.response.status).toBe(200);
    expect(callResult.json.error).toBeUndefined();
    expect(callResult.json.result).toBeDefined();

    // 3) The convex call should have happened exactly once, and it should
    //    carry the userId we minted into the bearer.
    expect(capturedConvex).toHaveLength(1);
    const call = capturedConvex[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      throw new Error("missing convex call");
    }
    expect(call.userIdHeader).toBe(TEST_USER_ID);
    expect(call.url).toContain("/api/thoughts/stats");
  });
});
