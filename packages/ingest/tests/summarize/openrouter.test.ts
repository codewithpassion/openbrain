import { describe, expect, test } from "bun:test";
import { createOpenRouterDigestSummarizer } from "../../src/summarize/openrouter";
import type { DigestSourceThought } from "../../src/summarize/types";

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function makeFetch(
  responseBody: unknown,
  opts?: { status?: number },
): { fetchFn: FetchLike; calls: Array<{ url: string; init: FetchInit }> } {
  const calls: Array<{ url: string; init: FetchInit }> = [];
  const fetchFn: FetchLike = (url, init) => {
    const recordedInit: FetchInit = {};
    if (init.method !== undefined) {
      recordedInit.method = init.method;
    }
    if (init.headers !== undefined) {
      recordedInit.headers = init.headers as Record<string, string>;
    }
    if (typeof init.body === "string") {
      recordedInit.body = init.body;
    }
    calls.push({ url, init: recordedInit });
    const body = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
    return Promise.resolve(
      new Response(body, {
        status: opts?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fetchFn, calls };
}

function chat(content: string) {
  return { choices: [{ message: { content } }] };
}

const SAMPLE_THOUGHTS: readonly DigestSourceThought[] = [
  {
    id: "t1",
    content: "Spent the morning re-reading the Qwen3 embedding paper.",
    type: "observation",
    topics: ["ai", "embeddings"],
    createdAt: 1_700_000_000_000,
  },
  {
    id: "t2",
    content: "Sketched a daily digest pipeline that writes to a digests table.",
    type: "idea",
    topics: ["openbrains"],
    createdAt: 1_700_000_100_000,
  },
];

describe("createOpenRouterDigestSummarizer", () => {
  test("returns a fixed 'No thoughts captured.' summary when input is empty (no network call)", async () => {
    const { fetchFn, calls } = makeFetch({});
    const sum = createOpenRouterDigestSummarizer({ apiKey: "k", fetch: fetchFn });
    const out = await sum.summarize([]);
    expect(out.summary).toBe("No thoughts captured.");
    expect(out.thoughtIds).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  test("calls OpenRouter chat/completions with the configured model and bearer", async () => {
    const { fetchFn, calls } = makeFetch(chat("- Re-read Qwen3.\n- Sketched digest pipeline."));
    const sum = createOpenRouterDigestSummarizer({
      apiKey: "secret-token",
      model: "anthropic/claude-haiku-4-5",
      fetch: fetchFn,
    });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(out.summary).toBe("- Re-read Qwen3.\n- Sketched digest pipeline.");
    expect(out.thoughtIds).toEqual(["t1", "t2"]);
    expect(out.generator).toBe("openrouter:anthropic/claude-haiku-4-5");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = calls[0]?.init.headers ?? {};
    expect(headers["Authorization"]).toBe("Bearer secret-token");
    const body = JSON.parse(calls[0]?.init.body ?? "{}") as Record<string, unknown>;
    expect(body["model"]).toBe("anthropic/claude-haiku-4-5");
    const messages = body["messages"] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("Spent the morning re-reading the Qwen3");
    expect(messages[1]?.content).toContain("[observation]");
    expect(messages[1]?.content).toContain("topics: ai, embeddings");
  });

  test("returns a fallback summary when the OpenRouter call returns non-2xx", async () => {
    const { fetchFn } = makeFetch({ error: "rate_limited" }, { status: 429 });
    const sum = createOpenRouterDigestSummarizer({ apiKey: "k", fetch: fetchFn });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(out.summary).toContain("Digest unavailable");
    expect(out.summary).toContain("2 thought(s)");
    expect(out.thoughtIds).toEqual(["t1", "t2"]);
  });

  test("returns a fallback when the response body has no usable content", async () => {
    const { fetchFn } = makeFetch({ choices: [{ message: { content: "" } }] });
    const sum = createOpenRouterDigestSummarizer({ apiKey: "k", fetch: fetchFn });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(out.summary).toContain("Digest unavailable");
  });

  test("returns a fallback when fetch throws", async () => {
    const throwingFetch: FetchLike = () => Promise.reject(new Error("network down"));
    const sum = createOpenRouterDigestSummarizer({ apiKey: "k", fetch: throwingFetch });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(out.summary).toContain("Digest unavailable");
  });
});
