import { describe, expect, test } from "bun:test";
import { runEdit } from "../../src/commands/edit";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runEdit", () => {
  test("forwards thoughtId + content to updateThought", async () => {
    let captured: { thoughtId?: string; content?: string } = {};
    const code = await runEdit({
      thoughtId: "th_123",
      content: "new content",
      flags: {},
      client: {
        ...fakeBaseClient,
        updateThought: (input) => {
          captured = input;
          return Promise.resolve({ thoughtId: input.thoughtId, reEmbedded: true });
        },
      },
    });
    expect(code).toBe(0);
    expect(captured).toEqual({ thoughtId: "th_123", content: "new content" });
  });

  test("propagates server errors", async () => {
    await expect(
      runEdit({
        thoughtId: "th_123",
        content: "anything",
        flags: {},
        client: {
          ...fakeBaseClient,
          updateThought: () => Promise.reject(new Error("FINGERPRINT_COLLISION")),
        },
      }),
    ).rejects.toThrow(/FINGERPRINT_COLLISION/);
  });
});
