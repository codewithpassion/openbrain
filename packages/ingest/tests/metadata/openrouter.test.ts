import { describe, expect, test } from "bun:test";
import type { ThoughtMetadata as ThoughtMetadataType } from "@openbrains/shared";
import { createOpenRouterMetadataExtractor } from "../../src/metadata/openrouter";

type CapturedHeaders = { Authorization?: string; "Content-Type"?: string };

type FetchInit = {
  method?: string;
  headers?: CapturedHeaders;
  body?: string;
};

// A minimal fetch-like callable. We don't need full `typeof fetch` here —
// the adapter only uses (url, init) → Promise<Response>.
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function makeFetch(
  responseBody: unknown,
  opts?: { status?: number },
): {
  fetchFn: FetchLike;
  calls: Array<{ url: string; init: FetchInit }>;
} {
  const calls: Array<{ url: string; init: FetchInit }> = [];
  const fetchFn: FetchLike = (url, init) => {
    const recordedInit: FetchInit = {};
    if (init.method !== undefined) {
      recordedInit.method = init.method;
    }
    if (init.headers !== undefined) {
      recordedInit.headers = init.headers as CapturedHeaders;
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

function chatCompletion(content: string): Record<string, unknown> {
  return { choices: [{ message: { content } }] };
}

const FALLBACK: ThoughtMetadataType = {
  type: "observation",
  topics: ["uncategorized"],
  people: [],
  action_items: [],
  dates_mentioned: [],
};

describe("createOpenRouterMetadataExtractor", () => {
  test("returns parsed metadata when the LLM response is valid JSON matching the schema", async () => {
    const llmJson = JSON.stringify({
      type: "task",
      topics: ["typescript"],
      people: ["alice"],
      action_items: ["review PR"],
      dates_mentioned: ["2026-05-18"],
    });
    const { fetchFn } = makeFetch(chatCompletion(llmJson));
    const extractor = createOpenRouterMetadataExtractor({ apiKey: "key", fetch: fetchFn });
    const out = await extractor.extract("Need to review PR with Alice on 2026-05-18");
    expect(out.type).toBe("task");
    expect(out.topics).toEqual(["typescript"]);
    expect(out.people).toEqual(["alice"]);
    expect(out.action_items).toEqual(["review PR"]);
    expect(out.dates_mentioned).toEqual(["2026-05-18"]);
  });

  test("sends the configured model and a system prompt mentioning the required fields", async () => {
    const { fetchFn, calls } = makeFetch(chatCompletion(JSON.stringify(FALLBACK)));
    const extractor = createOpenRouterMetadataExtractor({
      apiKey: "secret-key",
      model: "openai/gpt-4o-mini",
      fetch: fetchFn,
    });
    await extractor.extract("hello");
    expect(calls.length).toBe(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) {
      return;
    }
    expect(call.url).toContain("openrouter.ai");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers?.Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(call.init.body ?? "{}") as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string };
    };
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(body.response_format.type).toBe("json_object");
    const systemMsg = body.messages.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();
    const sys = systemMsg?.content ?? "";
    expect(sys).toContain("people");
    expect(sys).toContain("action_items");
    expect(sys).toContain("dates_mentioned");
    expect(sys).toContain("topics");
    expect(sys).toContain("type");
  });

  test("returns the safe fallback when the LLM returns malformed JSON", async () => {
    const { fetchFn } = makeFetch(chatCompletion("not valid json {{{"));
    const extractor = createOpenRouterMetadataExtractor({ apiKey: "key", fetch: fetchFn });
    const out = await extractor.extract("hello");
    expect(out).toEqual(FALLBACK);
  });

  test("returns the safe fallback when the JSON fails schema validation", async () => {
    const { fetchFn } = makeFetch(chatCompletion(JSON.stringify({ type: "bogus_type" })));
    const extractor = createOpenRouterMetadataExtractor({ apiKey: "key", fetch: fetchFn });
    const out = await extractor.extract("hello");
    expect(out).toEqual(FALLBACK);
  });

  test("returns the safe fallback when the upstream HTTP call fails", async () => {
    const { fetchFn } = makeFetch({ error: "nope" }, { status: 500 });
    const extractor = createOpenRouterMetadataExtractor({ apiKey: "key", fetch: fetchFn });
    const out = await extractor.extract("hello");
    expect(out).toEqual(FALLBACK);
  });

  test("respects a custom baseUrl", async () => {
    const { fetchFn, calls } = makeFetch(chatCompletion(JSON.stringify(FALLBACK)));
    const extractor = createOpenRouterMetadataExtractor({
      apiKey: "key",
      baseUrl: "https://custom.example.com/api/v1",
      fetch: fetchFn,
    });
    await extractor.extract("x");
    expect(calls[0]?.url).toBe("https://custom.example.com/api/v1/chat/completions");
  });
});
