import { describe, expect, test } from "bun:test";
import { runEnrich } from "../../src/commands/enrich";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runEnrich", () => {
  test("forwards thoughtId and surfaces enriched metadata", async () => {
    let captured: { thoughtId?: string } = {};
    const code = await runEnrich({
      thoughtId: "th_abc",
      apply: false,
      flags: {},
      client: {
        ...fakeBaseClient,
        enrichThought: (input) => {
          captured = input;
          return Promise.resolve({
            metadata: {
              type: "task" as const,
              topics: ["alpha"],
              people: [],
              action_items: ["ship feature"],
              dates_mentioned: [],
            },
          });
        },
      },
    });
    expect(code).toBe(0);
    expect(captured.thoughtId).toBe("th_abc");
  });
});
