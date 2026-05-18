import { describe, expect, test } from "bun:test";
import { runStats } from "../../src/commands/stats";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runStats", () => {
  test("calls thought_stats and returns 0", async () => {
    let called = false;
    const code = await runStats({
      flags: {},
      client: {
        ...fakeBaseClient,
        thoughtStats: () => {
          called = true;
          return Promise.resolve({
            total: 3,
            byType: { task: 2, idea: 1 },
            topTopics: [],
            topPeople: [],
          });
        },
      },
    });
    expect(code).toBe(0);
    expect(called).toBe(true);
  });
});
