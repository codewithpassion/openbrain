import { describe, expect, test } from "bun:test";
import { runList } from "../../src/commands/list";
import { fakeBaseClient } from "../helpers/fake-client";

describe("runList", () => {
  test("passes days and type flags to listThoughts", async () => {
    let captured: unknown = null;
    await runList({
      flags: { days: "7", type: "task" },
      client: {
        ...fakeBaseClient,
        listThoughts: (input) => {
          captured = input;
          return Promise.resolve({ thoughts: [] });
        },
      },
    });
    expect(captured).toEqual({ limit: 20, days: 7, type: "task" });
  });

  test("omits filters when flags are unset", async () => {
    let captured: unknown = null;
    await runList({
      flags: {},
      client: {
        ...fakeBaseClient,
        listThoughts: (input) => {
          captured = input;
          return Promise.resolve({ thoughts: [] });
        },
      },
    });
    expect(captured).toEqual({ limit: 20 });
  });

  test("ignores unrecognized --type values", async () => {
    let captured: Record<string, unknown> = {};
    await runList({
      flags: { type: "bogus" },
      client: {
        ...fakeBaseClient,
        listThoughts: (input) => {
          captured = input as unknown as Record<string, unknown>;
          return Promise.resolve({ thoughts: [] });
        },
      },
    });
    // biome-ignore lint/complexity/useLiteralKeys: tsc noPropertyAccessFromIndexSignature requires bracket access
    expect(captured["type"]).toBeUndefined();
  });
});
