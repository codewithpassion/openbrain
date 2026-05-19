import { describe, expect, test } from "bun:test";
import { buildBrainBundle, parseBrainBundle, tryParseBrainBundle } from "../../src/sources/bundle";
import type { BrainBundleThought } from "../../src/sources/types";

const sample: BrainBundleThought = {
  id: "t1",
  content: "hello",
  source: "dashboard",
  embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
  embeddingDims: 1024,
  fingerprint: "abc",
  createdAt: 1_700_000_000_000,
  metadata: {
    topics: ["a"],
    people: [],
    action_items: [],
    dates_mentioned: [],
  },
};

describe("buildBrainBundle / parseBrainBundle", () => {
  test("round-trips a minimal bundle", () => {
    const built = buildBrainBundle("u1", [sample], 1_700_000_500_000);
    const parsed = parseBrainBundle(JSON.parse(JSON.stringify(built)));
    expect(parsed.version).toBe(1);
    expect(parsed.userId).toBe("u1");
    expect(parsed.thoughts).toHaveLength(1);
    expect(parsed.thoughts[0]?.fingerprint).toBe("abc");
  });

  test("parseBrainBundle rejects unknown version", () => {
    expect(() =>
      parseBrainBundle({ version: 99, userId: "u1", exportedAt: 0, thoughts: [] }),
    ).toThrow();
  });

  test("tryParseBrainBundle reports a structured error for malformed input", () => {
    const out = tryParseBrainBundle({ version: 1, userId: "u1" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.length).toBeGreaterThan(0);
    }
  });

  test("tryParseBrainBundle accepts provenance + sourceRefs sidecars", () => {
    const withSidecars = buildBrainBundle("u1", [
      {
        ...sample,
        provenance: [{ origin: "human", capturedAt: 0 }],
        sourceRefs: [{ kind: "url", uri: "https://example.test" }],
      },
    ]);
    const out = tryParseBrainBundle(JSON.parse(JSON.stringify(withSidecars)));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.bundle.thoughts[0]?.provenance?.[0]?.origin).toBe("human");
    }
  });
});
