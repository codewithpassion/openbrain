import { describe, expect, test } from "bun:test";
import { ThoughtMetadata } from "@openbrains/shared";
import { createFakeMetadataExtractor } from "../../src/metadata/fake";

describe("createFakeMetadataExtractor", () => {
  test("returns the deterministic observation shape regardless of input", async () => {
    const extractor = createFakeMetadataExtractor();
    const a = await extractor.extract("anything goes here");
    const b = await extractor.extract("totally different content");
    expect(a).toEqual(b);
    expect(a.type).toBe("observation");
    expect(a.topics).toEqual(["test"]);
    expect(a.people).toEqual([]);
    expect(a.action_items).toEqual([]);
    expect(a.dates_mentioned).toEqual([]);
  });

  test("output round-trips through ThoughtMetadata schema", async () => {
    const extractor = createFakeMetadataExtractor();
    const out = await extractor.extract("hi");
    const reparsed = ThoughtMetadata.parse(out);
    expect(reparsed).toEqual(out);
  });
});
