import { describe, expect, test } from "bun:test";
import { runPan } from "../../src/commands/pan";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runPan", () => {
  test("forwards content + maxIdeas and lists returned ideas", async () => {
    let captured: { content?: string; maxIdeas?: number } = {};
    const code = await runPan({
      content: "buy milk; ship feature",
      apply: false,
      maxIdeas: 3,
      flags: {},
      client: {
        ...fakeBaseClient,
        panBrainDump: (input) => {
          captured = input;
          return Promise.resolve({
            ideas: [
              { content: "buy milk", type: "task" as const, topics: ["errands"] },
              { content: "ship feature", type: "task" as const, topics: [] },
            ],
          });
        },
      },
    });
    expect(code).toBe(0);
    expect(captured).toEqual({ content: "buy milk; ship feature", maxIdeas: 3 });
  });
});
