import { describe, expect, test } from "bun:test";
import { createFakeBrainDumpSplitter, createWorkersAiBrainDumpSplitter } from "../src/splitter";

describe("fake brain-dump splitter", () => {
  test("splits bulleted lines into ideas, capped by maxIdeas", async () => {
    const splitter = createFakeBrainDumpSplitter();
    const ideas = await splitter.split(
      "- write the report\n- email Bob\n- buy coffee\n- learn Rust",
      3,
    );
    expect(ideas.map((i) => i.content)).toEqual(["write the report", "email Bob", "buy coffee"]);
  });

  test("falls back to paragraph split when no bullets are present", async () => {
    const splitter = createFakeBrainDumpSplitter();
    const ideas = await splitter.split("first thought\n\nsecond thought", 5);
    expect(ideas.length).toBe(2);
  });
});

describe("workers-ai brain-dump splitter", () => {
  test("parses a Workers AI chat response into ideas", async () => {
    const calls: { model: string; messageCount: number }[] = [];
    const splitter = createWorkersAiBrainDumpSplitter({
      ai: {
        run: (model, input) => {
          calls.push({ model, messageCount: input.messages.length });
          return Promise.resolve({
            response: JSON.stringify({
              ideas: [{ content: "do A", type: "task", topics: ["work"] }, { content: "note B" }],
            }),
          });
        },
      },
    });
    const ideas = await splitter.split("blob", 10);
    expect(ideas.length).toBe(2);
    expect(ideas[0]?.type).toBe("task");
    expect(calls[0]?.model).toBe("@cf/meta/llama-3.1-8b-instruct");
  });

  test("falls back to single-idea passthrough when the binding returns no response", async () => {
    const splitter = createWorkersAiBrainDumpSplitter({
      ai: { run: () => Promise.resolve({}) },
    });
    const ideas = await splitter.split("just one thought", 3);
    expect(ideas).toEqual([{ content: "just one thought", topics: [] }]);
  });

  test("delegates to supplied fallback on parse failure", async () => {
    const splitter = createWorkersAiBrainDumpSplitter({
      ai: { run: () => Promise.resolve({ response: "not json" }) },
      fallback: createFakeBrainDumpSplitter(),
    });
    const ideas = await splitter.split("- one\n- two", 5);
    expect(ideas.map((i) => i.content)).toEqual(["one", "two"]);
  });

  test("caps results at maxIdeas (workers-ai)", async () => {
    const splitter = createWorkersAiBrainDumpSplitter({
      ai: {
        run: () =>
          Promise.resolve({
            response: JSON.stringify({
              ideas: [{ content: "a" }, { content: "b" }, { content: "c" }],
            }),
          }),
      },
    });
    const ideas = await splitter.split("blob", 2);
    expect(ideas.map((i) => i.content)).toEqual(["a", "b"]);
  });
});
