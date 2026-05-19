import { describe, expect, test } from "bun:test";
import { createOpenRouterEntityExtractor } from "../../src/entities/openrouter";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchReturning(body: unknown, status = 200): FetchLike {
  return () => Promise.resolve(jsonResponse(body, status));
}

function chat(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("createOpenRouterEntityExtractor", () => {
  test("parses entities and relations from a valid LLM JSON response", async () => {
    const llmJson = JSON.stringify({
      entities: [
        { canonicalName: "Cloudflare", kind: "org", aliases: ["CF"] },
        { canonicalName: "Dom", kind: "person", aliases: [] },
      ],
      relations: [
        {
          fromCanonicalName: "Dom",
          toCanonicalName: "Cloudflare",
          kind: "works_at",
          confidence: 0.92,
        },
      ],
    });
    const ext = createOpenRouterEntityExtractor({
      apiKey: "k",
      fetch: fetchReturning(chat(llmJson)),
    });
    const out = await ext.extract("Dom works at Cloudflare.");
    expect(out.entities.map((e) => e.canonicalName)).toEqual(["Cloudflare", "Dom"]);
    expect(out.relations).toHaveLength(1);
    expect(out.relations[0]?.confidence).toBe(0.92);
  });

  test("ignores malformed entries", async () => {
    const llmJson = JSON.stringify({
      entities: [
        { canonicalName: "OK", kind: "topic" },
        { kind: "topic" }, // missing name
        { canonicalName: 42, kind: "topic" }, // wrong type
      ],
      relations: [{ fromCanonicalName: "OK" }], // missing fields
    });
    const ext = createOpenRouterEntityExtractor({
      apiKey: "k",
      fetch: fetchReturning(chat(llmJson)),
    });
    const out = await ext.extract("noise");
    expect(out.entities.map((e) => e.canonicalName)).toEqual(["OK"]);
    expect(out.relations).toEqual([]);
  });

  test("returns empty on non-2xx", async () => {
    const ext = createOpenRouterEntityExtractor({
      apiKey: "k",
      fetch: fetchReturning({}, 500),
    });
    const out = await ext.extract("Dom");
    expect(out).toEqual({ entities: [], relations: [] });
  });

  test("returns empty on fetch throw", async () => {
    const ext = createOpenRouterEntityExtractor({
      apiKey: "k",
      fetch: () => Promise.reject(new Error("boom")),
    });
    const out = await ext.extract("Dom");
    expect(out).toEqual({ entities: [], relations: [] });
  });

  test("returns empty on empty content (no network call needed)", async () => {
    let called = 0;
    const ext = createOpenRouterEntityExtractor({
      apiKey: "k",
      fetch: () => {
        called += 1;
        return Promise.resolve(jsonResponse(chat("{}")));
      },
    });
    const out = await ext.extract("   ");
    expect(out).toEqual({ entities: [], relations: [] });
    expect(called).toBe(0);
  });
});
