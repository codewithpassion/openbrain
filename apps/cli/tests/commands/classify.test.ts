import { describe, expect, test } from "bun:test";
import { runClassify } from "../../src/commands/classify";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runClassify", () => {
  test("forwards the thoughtId and surfaces the inferred type", async () => {
    let captured: { thoughtId?: string } = {};
    const code = await runClassify({
      thoughtId: "th_123",
      apply: false,
      flags: {},
      client: {
        ...fakeBaseClient,
        classifyThought: (input) => {
          captured = input;
          return Promise.resolve({ type: "idea" as const });
        },
      },
    });
    expect(code).toBe(0);
    expect(captured.thoughtId).toBe("th_123");
  });

  test("rejects an empty thoughtId via Zod parsing", async () => {
    await expect(
      runClassify({
        thoughtId: "",
        apply: false,
        flags: {},
        client: fakeBaseClient,
      }),
    ).rejects.toThrow();
  });

  test("--apply path calls applyClassification", async () => {
    let called = false;
    const code = await runClassify({
      thoughtId: "th_123",
      apply: true,
      flags: {},
      client: {
        ...fakeBaseClient,
        applyClassification: () => {
          called = true;
          return Promise.resolve({ type: "task" as const, applied: true });
        },
      },
    });
    expect(code).toBe(0);
    expect(called).toBe(true);
  });
});
