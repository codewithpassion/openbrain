import { describe, expect, test } from "bun:test";
import { runRecall } from "../../src/commands/recall";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runRecall", () => {
  test("calls memory_recall with the query", async () => {
    let captured: unknown = null;
    await runRecall({
      query: "what did Bob say?",
      flags: {},
      client: {
        ...fakeBaseClient,
        memoryRecall: (input) => {
          captured = input;
          return Promise.resolve({ results: [] });
        },
      },
    });
    expect(captured).toEqual({ query: "what did Bob say?", limit: 10, threshold: 0.5 });
  });
});
