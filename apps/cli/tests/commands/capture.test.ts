import { describe, expect, test } from "bun:test";
import { ThoughtId } from "@openbrains/shared";
import { runCapture } from "../../src/commands/capture";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runCapture", () => {
  test("calls capture_thought with cli source and returns 0", async () => {
    const calls: unknown[] = [];
    const code = await runCapture({
      content: "hello world",
      flags: {},
      client: {
        ...fakeBaseClient,
        captureThought: (input) => {
          calls.push(input);
          return Promise.resolve({
            thoughtId: ThoughtId.parse("th_test_1"),
            duplicate: false,
          });
        },
      },
    });
    expect(code).toBe(0);
    expect(calls).toEqual([{ content: "hello world", source: "cli" }]);
  });

  test("respects duplicate result", async () => {
    const code = await runCapture({
      content: "x",
      flags: {},
      client: {
        ...fakeBaseClient,
        captureThought: () =>
          Promise.resolve({ thoughtId: ThoughtId.parse("th_dup"), duplicate: true }),
      },
    });
    expect(code).toBe(0);
  });
});
