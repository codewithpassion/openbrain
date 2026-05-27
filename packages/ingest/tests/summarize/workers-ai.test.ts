import { describe, expect, test } from "bun:test";
import type { DigestSourceThought } from "../../src/summarize/types";
import { createWorkersAiDigestSummarizer } from "../../src/summarize/workers-ai";

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

describe("createWorkersAiDigestSummarizer", () => {
  test("returns 'No thoughts captured.' when empty without calling AI", async () => {
    const ai = makeAi(() => "should not be called");
    const sum = createWorkersAiDigestSummarizer({ ai: ai.binding });
    const out = await sum.summarize([]);
    expect(out.summary).toBe("No thoughts captured.");
    expect(out.thoughtIds).toEqual([]);
    expect(ai.calls).toHaveLength(0);
  });

  test("calls the chat binding with the configured model and returns the LLM text", async () => {
    const ai = makeAi(() => "- Re-read Qwen3.\n- Sketched digest pipeline.");
    const sum = createWorkersAiDigestSummarizer({ ai: ai.binding });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(out.summary).toBe("- Re-read Qwen3.\n- Sketched digest pipeline.");
    expect(out.thoughtIds).toEqual(["t1", "t2"]);
    expect(out.generator).toBe("workers-ai:@cf/meta/llama-3.1-8b-instruct");
    expect(ai.calls).toHaveLength(1);
    const call = ai.calls[0];
    if (!call) {
      throw new Error("expected one call");
    }
    expect(call.model).toBe("@cf/meta/llama-3.1-8b-instruct");
    expect(call.input.messages[0]?.role).toBe("system");
    expect(call.input.messages[1]?.content).toContain("Spent the morning re-reading the Qwen3");
    expect(call.input.messages[1]?.content).toContain("[observation]");
    expect(call.input.messages[1]?.content).toContain("topics: ai, embeddings");
  });

  test("respects the model override", async () => {
    const ai = makeAi(() => "- summary");
    const sum = createWorkersAiDigestSummarizer({ ai: ai.binding, model: "@cf/meta/other" });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(ai.calls[0]?.model).toBe("@cf/meta/other");
    expect(out.generator).toBe("workers-ai:@cf/meta/other");
  });

  test("returns a fallback when AI response is empty", async () => {
    const ai = makeAi(() => "");
    const sum = createWorkersAiDigestSummarizer({ ai: ai.binding });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(out.summary).toContain("Digest unavailable");
    expect(out.summary).toContain("2 thought(s)");
    expect(out.thoughtIds).toEqual(["t1", "t2"]);
  });

  test("returns a fallback when AI binding throws", async () => {
    const binding = { run: () => Promise.reject(new Error("boom")) };
    const sum = createWorkersAiDigestSummarizer({ ai: binding });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(out.summary).toContain("Digest unavailable");
    expect(out.thoughtIds).toEqual(["t1", "t2"]);
  });

  test("returns a fallback when response is missing entirely", async () => {
    const ai = makeAi(() => undefined);
    const sum = createWorkersAiDigestSummarizer({ ai: ai.binding });
    const out = await sum.summarize(SAMPLE_THOUGHTS);
    expect(out.summary).toContain("Digest unavailable");
  });
});
