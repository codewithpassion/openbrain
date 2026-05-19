import { describe, expect, test } from "bun:test";
import type { ThoughtMetadata as ThoughtMetadataType } from "@openbrains/shared";
import {
  createWorkersAiMetadataExtractor,
  type WorkersAiChatBinding,
} from "../../src/metadata/workers-ai";

const FALLBACK: ThoughtMetadataType = {
  type: "observation",
  topics: ["uncategorized"],
  people: [],
  action_items: [],
  dates_mentioned: [],
};

interface RecordedCall {
  model: string;
  input: unknown;
}

function makeAi(
  reply: string | { response: string },
  opts?: { throws?: Error },
): { ai: WorkersAiChatBinding; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const ai: WorkersAiChatBinding = {
    run(model, input) {
      calls.push({ model, input });
      if (opts?.throws) {
        return Promise.reject(opts.throws);
      }
      const body = typeof reply === "string" ? { response: reply } : reply;
      return Promise.resolve(body);
    },
  };
  return { ai, calls };
}

describe("createWorkersAiMetadataExtractor", () => {
  test("returns parsed metadata when the model produces valid JSON", async () => {
    const json = JSON.stringify({
      type: "idea",
      topics: ["memory"],
      people: ["bob"],
      action_items: ["draft RFC"],
      dates_mentioned: ["2026-05-20"],
    });
    const { ai } = makeAi(json);
    const extractor = createWorkersAiMetadataExtractor({ ai });
    const out = await extractor.extract("brainstorm RFC with Bob on 2026-05-20");
    expect(out.type).toBe("idea");
    expect(out.topics).toEqual(["memory"]);
    expect(out.people).toEqual(["bob"]);
    expect(out.action_items).toEqual(["draft RFC"]);
    expect(out.dates_mentioned).toEqual(["2026-05-20"]);
  });

  test("sends the configured model and a system prompt naming the required fields", async () => {
    const { ai, calls } = makeAi(JSON.stringify(FALLBACK));
    const extractor = createWorkersAiMetadataExtractor({
      ai,
      model: "@cf/meta/llama-3.1-8b-instruct",
    });
    await extractor.extract("hello");
    expect(calls.length).toBe(1);
    const call = calls[0];
    expect(call?.model).toBe("@cf/meta/llama-3.1-8b-instruct");
    const input = call?.input as {
      messages: Array<{ role: string; content: string }>;
    };
    const sys = input.messages.find((m) => m.role === "system")?.content ?? "";
    expect(sys).toContain("topics");
    expect(sys).toContain("people");
    expect(sys).toContain("action_items");
    expect(sys).toContain("dates_mentioned");
    expect(sys).toContain("type");
  });

  test("returns the safe fallback when the model returns malformed JSON", async () => {
    const { ai } = makeAi("not json {{");
    const extractor = createWorkersAiMetadataExtractor({ ai });
    expect(await extractor.extract("x")).toEqual(FALLBACK);
  });

  test("returns the safe fallback when the model returns an unparseable schema", async () => {
    const { ai } = makeAi(JSON.stringify({ type: "wat" }));
    const extractor = createWorkersAiMetadataExtractor({ ai });
    expect(await extractor.extract("x")).toEqual(FALLBACK);
  });

  test("returns the safe fallback when the binding throws", async () => {
    const { ai } = makeAi("", { throws: new Error("boom") });
    const extractor = createWorkersAiMetadataExtractor({ ai });
    expect(await extractor.extract("x")).toEqual(FALLBACK);
  });
});
