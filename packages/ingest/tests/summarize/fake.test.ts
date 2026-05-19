import { describe, expect, test } from "bun:test";
import { createFakeDigestSummarizer } from "../../src/summarize/fake";

describe("createFakeDigestSummarizer", () => {
  test("emits the 'No thoughts' line for empty input", async () => {
    const sum = createFakeDigestSummarizer();
    const out = await sum.summarize([]);
    expect(out.summary).toBe("No thoughts captured.");
    expect(out.thoughtIds).toEqual([]);
    expect(out.generator).toBe("fake:digest");
  });

  test("aggregates topics and counts deterministically", async () => {
    const sum = createFakeDigestSummarizer({ generator: "fake:test-run" });
    const out = await sum.summarize([
      { id: "a", content: "x", topics: ["ai", "ml"], createdAt: 0 },
      { id: "b", content: "y", topics: ["ml", "infra"], createdAt: 1 },
    ]);
    expect(out.summary).toContain("Captured 2 thought(s)");
    expect(out.summary).toContain("ai");
    expect(out.summary).toContain("infra");
    expect(out.thoughtIds).toEqual(["a", "b"]);
    expect(out.generator).toBe("fake:test-run");
  });
});
