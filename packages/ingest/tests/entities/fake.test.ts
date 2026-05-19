import { describe, expect, test } from "bun:test";
import { createFakeEntityExtractor } from "../../src/entities/fake";

describe("createFakeEntityExtractor", () => {
  test("extracts unique capitalized tokens as topic entities", async () => {
    const ext = createFakeEntityExtractor();
    const out = await ext.extract("Dom works at Cloudflare. Dom also reads Qwen3 papers.");
    expect(out.entities.map((e) => e.canonicalName)).toEqual(["Dom", "Cloudflare", "Qwen"]);
    expect(out.entities.every((e) => e.kind === "topic")).toBe(true);
    expect(out.relations).toEqual([]);
  });

  test("returns empty for empty / lowercase-only input", async () => {
    const ext = createFakeEntityExtractor();
    expect((await ext.extract("")).entities).toEqual([]);
    expect((await ext.extract("just plain lowercase notes")).entities).toEqual([]);
  });
});
