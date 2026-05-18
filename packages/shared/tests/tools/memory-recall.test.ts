import { describe, expect, test } from "bun:test";
import { memoryRecallInputSchema, memoryRecallOutputSchema } from "../../src/tools/memory-recall";

describe("memoryRecallInputSchema", () => {
  test("parses a canonical valid input", () => {
    const parsed = memoryRecallInputSchema.parse({
      query: "what did I say about typescript",
      limit: 20,
      minTrustGrade: "evidence",
    });
    expect(parsed.query).toBe("what did I say about typescript");
    expect(parsed.minTrustGrade).toBe("evidence");
  });

  test("applies defaults when only query is given", () => {
    const parsed = memoryRecallInputSchema.parse({ query: "x" });
    expect(parsed.limit).toBeGreaterThan(0);
    expect(parsed.limit).toBeLessThanOrEqual(100);
  });

  test("rejects limit = 101", () => {
    const result = memoryRecallInputSchema.safeParse({ query: "x", limit: 101 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["limit"]);
      expect(issue?.code).toBe("too_big");
    }
  });

  test("rejects an unknown trust grade", () => {
    const result = memoryRecallInputSchema.safeParse({
      query: "x",
      minTrustGrade: "gospel",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["minTrustGrade"]);
    }
  });

  test("rejects empty query", () => {
    const result = memoryRecallInputSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["query"]);
    }
  });
});

describe("memoryRecallOutputSchema", () => {
  test("parses a results array with provenance and trust grade", () => {
    const parsed = memoryRecallOutputSchema.parse({
      results: [
        {
          id: "th_1",
          score: 0.92,
          content: "x",
          trustGrade: "evidence",
          origin: "human",
          createdAt: 1_700_000_000_000,
        },
      ],
    });
    expect(parsed.results[0]?.trustGrade).toBe("evidence");
  });

  test("rejects an unknown origin in a result", () => {
    const result = memoryRecallOutputSchema.safeParse({
      results: [
        {
          id: "th_1",
          score: 0.5,
          content: "x",
          trustGrade: "evidence",
          origin: "alien",
          createdAt: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["results", 0, "origin"]);
    }
  });
});
