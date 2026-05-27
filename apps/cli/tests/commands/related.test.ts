import { describe, expect, test } from "bun:test";
import { runRelated } from "../../src/commands/related";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runRelated", () => {
  test("forwards thoughtId, limit, and threshold with sane defaults", async () => {
    let captured: { thoughtId?: string; limit?: number; threshold?: number } = {};
    const code = await runRelated({
      thoughtId: "th_xyz",
      flags: {},
      client: {
        ...fakeBaseClient,
        relatedThoughts: (input) => {
          captured = input;
          return Promise.resolve({ results: [] });
        },
      },
    });
    expect(code).toBe(0);
    expect(captured.thoughtId).toBe("th_xyz");
    expect(captured.limit).toBe(10);
    expect(captured.threshold).toBe(0.85);
  });

  test("respects an explicit limit and threshold", async () => {
    let captured: { limit?: number; threshold?: number } = {};
    await runRelated({
      thoughtId: "th_xyz",
      limit: 5,
      threshold: 0.7,
      flags: {},
      client: {
        ...fakeBaseClient,
        relatedThoughts: (input) => {
          captured = input;
          return Promise.resolve({ results: [] });
        },
      },
    });
    expect(captured.limit).toBe(5);
    expect(captured.threshold).toBe(0.7);
  });
});
