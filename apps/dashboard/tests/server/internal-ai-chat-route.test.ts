import { describe, expect, test } from "bun:test";
import {
  type AiChatRouteEnv,
  handleAiChatRequest,
  INTERNAL_AI_CHAT_PATH,
} from "../../src/server/internal-ai-chat-route";

interface FakeAiCall {
  model: string;
  input: unknown;
}

function makeFakeAi(reply: { response?: string } = { response: "ok" }) {
  const calls: FakeAiCall[] = [];
  return {
    calls,
    binding: {
      run(model: string, input: unknown): Promise<{ response?: string }> {
        calls.push({ model, input });
        return Promise.resolve(reply);
      },
    },
  };
}

function makeEnv(secret: string, ai = makeFakeAi().binding): AiChatRouteEnv {
  return { AI: ai, INTERNAL_API_SECRET: secret };
}

function makeRequest(opts: { method?: string; secret?: string; body?: unknown }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.secret !== undefined) {
    headers["x-openbrains-internal-secret"] = opts.secret;
  }
  const init: RequestInit = { method: opts.method ?? "POST", headers };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return new Request(`https://ob-dash.example.com${INTERNAL_AI_CHAT_PATH}`, init);
}

describe("internal AI chat route", () => {
  test("forwards a well-formed chat request and returns response", async () => {
    const ai = makeFakeAi({ response: "hello back" });
    const env = makeEnv("s", ai.binding);
    const res = await handleAiChatRequest(
      makeRequest({
        secret: "s",
        body: {
          model: "@cf/meta/llama-3.1-8b-instruct",
          input: {
            messages: [{ role: "user", content: "hi" }],
            response_format: { type: "json_object" },
          },
        },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { response?: string };
    expect(json.response).toBe("hello back");
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]?.model).toBe("@cf/meta/llama-3.1-8b-instruct");
  });

  test("returns {} when AI binding response is missing", async () => {
    const env = makeEnv("s", makeFakeAi({}).binding);
    const res = await handleAiChatRequest(
      makeRequest({
        secret: "s",
        body: {
          model: "m",
          input: { messages: [{ role: "user", content: "x" }] },
        },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { response?: string };
    expect(json.response).toBeUndefined();
  });

  test("401 when secret missing", async () => {
    const env = makeEnv("s");
    const res = await handleAiChatRequest(
      makeRequest({ body: { model: "m", input: { messages: [{ role: "user", content: "x" }] } } }),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("401 when secret wrong", async () => {
    const env = makeEnv("s");
    const res = await handleAiChatRequest(
      makeRequest({
        secret: "nope",
        body: { model: "m", input: { messages: [{ role: "user", content: "x" }] } },
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("400 when body is missing required shape", async () => {
    const env = makeEnv("s");
    const res = await handleAiChatRequest(
      makeRequest({ secret: "s", body: { input: { messages: [{ role: "user", content: "x" }] } } }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("400 when messages is empty", async () => {
    const env = makeEnv("s");
    const res = await handleAiChatRequest(
      makeRequest({ secret: "s", body: { model: "m", input: { messages: [] } } }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("400 when a message is malformed", async () => {
    const env = makeEnv("s");
    const res = await handleAiChatRequest(
      makeRequest({
        secret: "s",
        body: { model: "m", input: { messages: [{ role: "user" }] } },
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("405 for non-POST", async () => {
    const env = makeEnv("s");
    const res = await handleAiChatRequest(makeRequest({ method: "GET", secret: "s" }), env);
    expect(res.status).toBe(405);
  });

  test("500 if INTERNAL_API_SECRET is misconfigured (empty)", async () => {
    const env = makeEnv("");
    const res = await handleAiChatRequest(
      makeRequest({
        secret: "s",
        body: { model: "m", input: { messages: [{ role: "user", content: "x" }] } },
      }),
      env,
    );
    expect(res.status).toBe(500);
  });
});
