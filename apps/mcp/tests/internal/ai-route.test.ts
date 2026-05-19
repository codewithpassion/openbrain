import { describe, expect, test } from "bun:test";
import {
  type AiRouteEnv,
  handleAiRunRequest,
  INTERNAL_AI_RUN_PATH,
} from "../../src/internal/ai-route";
import { makeFakeAi } from "../helpers/fakes";

function makeEnv(secret: string): AiRouteEnv {
  return { AI: makeFakeAi({ dimensions: 1024 }), INTERNAL_API_SECRET: secret };
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
  return new Request(`https://ob-mcp.example.com${INTERNAL_AI_RUN_PATH}`, init);
}

describe("internal AI run route", () => {
  test("forwards a well-formed request to the AI binding", async () => {
    const env = makeEnv("s");
    const res = await handleAiRunRequest(
      makeRequest({
        secret: "s",
        body: { model: "@cf/qwen/qwen3-embedding-0.6b", input: { text: ["hi"] } },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: number[][] };
    expect(json.data.length).toBe(1);
    expect(json.data[0]?.length).toBe(1024);
  });

  test("401 when secret missing", async () => {
    const env = makeEnv("s");
    const res = await handleAiRunRequest(
      makeRequest({ body: { model: "m", input: { text: ["x"] } } }),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("401 when secret wrong", async () => {
    const env = makeEnv("s");
    const res = await handleAiRunRequest(
      makeRequest({ secret: "nope", body: { model: "m", input: { text: ["x"] } } }),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("400 when body shape is invalid", async () => {
    const env = makeEnv("s");
    const res = await handleAiRunRequest(
      makeRequest({ secret: "s", body: { input: { text: ["x"] } } }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("405 for non-POST", async () => {
    const env = makeEnv("s");
    const res = await handleAiRunRequest(makeRequest({ method: "GET", secret: "s" }), env);
    expect(res.status).toBe(405);
  });

  test("500 if INTERNAL_API_SECRET is misconfigured (empty)", async () => {
    const env = makeEnv("");
    const res = await handleAiRunRequest(
      makeRequest({ secret: "s", body: { model: "m", input: { text: ["x"] } } }),
      env,
    );
    expect(res.status).toBe(500);
  });
});
