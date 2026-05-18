import { describe, expect, test } from "bun:test";
import {
  searchThoughtsInputSchema,
  searchThoughtsOutputSchema,
} from "../../src/tools/search-thoughts";

describe("searchThoughtsInputSchema", () => {
  test("parses a canonical valid input", () => {
    const parsed = searchThoughtsInputSchema.parse({
      query: "typescript zod",
      limit: 10,
      threshold: 0.5,
    });
    expect(parsed.query).toBe("typescript zod");
    expect(parsed.limit).toBe(10);
  });

  test("applies defaults when limit/threshold omitted", () => {
    const parsed = searchThoughtsInputSchema.parse({ query: "x" });
    expect(parsed.limit).toBeGreaterThan(0);
    expect(parsed.threshold).toBeGreaterThanOrEqual(0);
    expect(parsed.threshold).toBeLessThanOrEqual(1);
  });

  test("accepts limit = 100 (upper boundary)", () => {
    const parsed = searchThoughtsInputSchema.parse({ query: "x", limit: 100 });
    expect(parsed.limit).toBe(100);
  });

  test("rejects limit = 101", () => {
    const result = searchThoughtsInputSchema.safeParse({ query: "x", limit: 101 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["limit"]);
      expect(issue?.code).toBe("too_big");
    }
  });

  test("rejects threshold > 1", () => {
    const result = searchThoughtsInputSchema.safeParse({ query: "x", threshold: 1.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["threshold"]);
    }
  });

  test("rejects empty query", () => {
    const result = searchThoughtsInputSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["query"]);
    }
  });
});

describe("searchThoughtsOutputSchema", () => {
  test("parses a results array", () => {
    const parsed = searchThoughtsOutputSchema.parse({
      results: [
        {
          id: "th_1",
          score: 0.92,
          content: "hello",
          source: "cli",
          createdAt: 1_700_000_000_000,
        },
      ],
    });
    const firstId: string | undefined = parsed.results[0]?.id;
    expect(firstId).toBe("th_1");
  });

  test("rejects score outside [0, 1]", () => {
    const result = searchThoughtsOutputSchema.safeParse({
      results: [
        {
          id: "th_1",
          score: 1.5,
          content: "x",
          source: "cli",
          createdAt: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
