import { describe, expect, test } from "bun:test";
import { createWorkersAiEntityExtractor } from "../../src/entities/workers-ai";

interface RunCall {
  model: string;
  input: {
    readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
    readonly response_format?: { readonly type: "json_object" };
  };
}

function makeAi(respond: (call: RunCall) => string | undefined) {
  const calls: RunCall[] = [];
  return {
    calls,
    binding: {
      run(model: string, input: RunCall["input"]) {
        const call = { model, input };
        calls.push(call);
        const response = respond(call);
        return Promise.resolve(response === undefined ? {} : { response });
      },
    },
  };
}

describe("createWorkersAiEntityExtractor", () => {
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
    const ai = makeAi(() => llmJson);
    const ext = createWorkersAiEntityExtractor({ ai: ai.binding });
    const out = await ext.extract("Dom works at Cloudflare.");
    expect(out.entities.map((e) => e.canonicalName)).toEqual(["Cloudflare", "Dom"]);
    expect(out.relations).toHaveLength(1);
    expect(out.relations[0]?.confidence).toBe(0.92);
    expect(ai.calls[0]?.model).toBe("@cf/meta/llama-3.1-8b-instruct");
    expect(ai.calls[0]?.input.response_format?.type).toBe("json_object");
  });

  test("ignores malformed entries", async () => {
    const llmJson = JSON.stringify({
      entities: [
        { canonicalName: "OK", kind: "topic" },
        { kind: "topic" },
        { canonicalName: 42, kind: "topic" },
      ],
      relations: [{ fromCanonicalName: "OK" }],
    });
    const ai = makeAi(() => llmJson);
    const ext = createWorkersAiEntityExtractor({ ai: ai.binding });
    const out = await ext.extract("noise");
    expect(out.entities.map((e) => e.canonicalName)).toEqual(["OK"]);
    expect(out.relations).toEqual([]);
  });

  test("returns empty on missing response", async () => {
    const ai = makeAi(() => undefined);
    const ext = createWorkersAiEntityExtractor({ ai: ai.binding });
    const out = await ext.extract("Dom");
    expect(out).toEqual({ entities: [], relations: [] });
  });

  test("returns empty on binding throw", async () => {
    const binding = {
      run: () => Promise.reject(new Error("boom")),
    };
    const ext = createWorkersAiEntityExtractor({ ai: binding });
    const out = await ext.extract("Dom");
    expect(out).toEqual({ entities: [], relations: [] });
  });

  test("returns empty on empty content (no AI call)", async () => {
    const ai = makeAi(() => "{}");
    const ext = createWorkersAiEntityExtractor({ ai: ai.binding });
    const out = await ext.extract("   ");
    expect(out).toEqual({ entities: [], relations: [] });
    expect(ai.calls.length).toBe(0);
  });

  test("respects the model override", async () => {
    const ai = makeAi(() => JSON.stringify({ entities: [], relations: [] }));
    const ext = createWorkersAiEntityExtractor({ ai: ai.binding, model: "@cf/meta/other" });
    await ext.extract("hi");
    expect(ai.calls[0]?.model).toBe("@cf/meta/other");
  });
});
