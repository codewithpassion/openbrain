import { describe, expect, test } from "bun:test";
import {
  createWorkersAiEmbedder,
  createWorkersAiHttpClient,
  EmbeddingError,
} from "../src/embeddings";

describe("workers-ai HTTP client", () => {
  test("posts model + input with the internal-secret header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createWorkersAiHttpClient({
      baseUrl: "https://ob-mcp.example.com",
      internalSecret: "shh",
      fetch: (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(
          new Response(JSON.stringify({ data: [Array.from({ length: 1024 }, () => 0)] }), {
            status: 200,
          }),
        );
      },
    });
    const result = await client.run("@cf/qwen/qwen3-embedding-0.6b", { text: ["hello"] });
    expect(result.data[0]?.length).toBe(1024);
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (!call) {
      throw new Error("expected at least one call");
    }
    expect(call.url).toBe("https://ob-mcp.example.com/internal/ai/run");
    expect((call.init.headers as Record<string, string>)["x-openbrains-internal-secret"]).toBe(
      "shh",
    );
    expect(JSON.parse(call.init.body as string)).toEqual({
      model: "@cf/qwen/qwen3-embedding-0.6b",
      input: { text: ["hello"] },
    });
  });

  test("plugs into the existing Workers AI embedder", async () => {
    const vec = Array.from({ length: 1024 }, (_, i) => i / 1024 - 0.5);
    const client = createWorkersAiHttpClient({
      baseUrl: "https://ob-mcp.example.com",
      internalSecret: "shh",
      fetch: () => Promise.resolve(new Response(JSON.stringify({ data: [vec] }), { status: 200 })),
    });
    const embedder = createWorkersAiEmbedder(client);
    const out = await embedder.embed("hi");
    expect(out.vector.length).toBe(1024);
    expect(out.dimensions).toBe(1024);
  });

  test("throws EmbeddingError on non-2xx", async () => {
    const client = createWorkersAiHttpClient({
      baseUrl: "https://ob-mcp.example.com",
      internalSecret: "shh",
      fetch: () => Promise.resolve(new Response("nope", { status: 500 })),
    });
    await expect(client.run("m", { text: ["x"] })).rejects.toBeInstanceOf(EmbeddingError);
  });

  test("throws EmbeddingError when payload is malformed", async () => {
    const client = createWorkersAiHttpClient({
      baseUrl: "https://ob-mcp.example.com",
      internalSecret: "shh",
      fetch: () =>
        Promise.resolve(new Response(JSON.stringify({ wrong: "shape" }), { status: 200 })),
    });
    await expect(client.run("m", { text: ["x"] })).rejects.toBeInstanceOf(EmbeddingError);
  });
});
