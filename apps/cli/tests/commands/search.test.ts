import { describe, expect, test } from "bun:test";
import { runSearch } from "../../src/commands/search";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runSearch", () => {
  test("forwards limit and query to searchThoughts", async () => {
    let captured: unknown = null;
    const code = await runSearch({
      query: "robots",
      limit: 5,
      flags: {},
      client: {
        ...fakeBaseClient,
        searchThoughts: (input) => {
          captured = input;
          return Promise.resolve({ results: [] });
        },
      },
    });
    expect(code).toBe(0);
    expect(captured).toEqual({ query: "robots", limit: 5, threshold: 0.5 });
  });

  test("defaults limit to 10", async () => {
    let captured: { limit?: number } = {};
    await runSearch({
      query: "robots",
      flags: {},
      client: {
        ...fakeBaseClient,
        searchThoughts: (input) => {
          captured = input;
          return Promise.resolve({ results: [] });
        },
      },
    });
    expect(captured.limit).toBe(10);
  });
});
