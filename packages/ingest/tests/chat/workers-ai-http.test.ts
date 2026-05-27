import { describe, expect, test } from "bun:test";
import { createWorkersAiHttpChatClient } from "../../src/chat/workers-ai-http";

describe("workers-ai HTTP chat client", () => {
  test("posts model + messages with the internal-secret header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createWorkersAiHttpChatClient({
      baseUrl: "https://ob-dash.example.com",
      internalSecret: "shh",
      fetch: (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(new Response(JSON.stringify({ response: "ok" }), { status: 200 }));
      },
    });
    const result = await client.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: "hi" }],
      response_format: { type: "json_object" },
    });
    expect(result.response).toBe("ok");
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (!call) {
      throw new Error("expected at least one call");
    }
    expect(call.url).toBe("https://ob-dash.example.com/internal/ai/chat");
    expect((call.init.headers as Record<string, string>)["x-openbrains-internal-secret"]).toBe(
      "shh",
    );
    expect(JSON.parse(call.init.body as string)).toEqual({
      model: "@cf/meta/llama-3.1-8b-instruct",
      input: {
        messages: [{ role: "user", content: "hi" }],
        response_format: { type: "json_object" },
      },
    });
  });

  test("strips trailing slash on baseUrl", async () => {
    const calls: { url: string }[] = [];
    const client = createWorkersAiHttpChatClient({
      baseUrl: "https://ob-dash.example.com/",
      internalSecret: "shh",
      fetch: (url) => {
        calls.push({ url });
        return Promise.resolve(new Response(JSON.stringify({ response: "" }), { status: 200 }));
      },
    });
    await client.run("m", { messages: [{ role: "user", content: "x" }] });
    expect(calls[0]?.url).toBe("https://ob-dash.example.com/internal/ai/chat");
  });

  test("returns response=undefined when payload omits it", async () => {
    const client = createWorkersAiHttpChatClient({
      baseUrl: "https://ob-dash.example.com",
      internalSecret: "shh",
      fetch: () => Promise.resolve(new Response("{}", { status: 200 })),
    });
    const result = await client.run("m", { messages: [{ role: "user", content: "x" }] });
    expect(result.response).toBeUndefined();
  });

  test("throws on non-2xx", async () => {
    const client = createWorkersAiHttpChatClient({
      baseUrl: "https://ob-dash.example.com",
      internalSecret: "shh",
      fetch: () => Promise.resolve(new Response("nope", { status: 500 })),
    });
    await expect(client.run("m", { messages: [{ role: "user", content: "x" }] })).rejects.toThrow(
      /500/,
    );
  });

  test("throws on non-JSON response", async () => {
    const client = createWorkersAiHttpChatClient({
      baseUrl: "https://ob-dash.example.com",
      internalSecret: "shh",
      fetch: () => Promise.resolve(new Response("not-json", { status: 200 })),
    });
    await expect(client.run("m", { messages: [{ role: "user", content: "x" }] })).rejects.toThrow();
  });
});
