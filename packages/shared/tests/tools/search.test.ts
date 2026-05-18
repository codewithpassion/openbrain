import { describe, expect, test } from "bun:test";
import { searchInputSchema, searchOutputSchema } from "../../src/tools/search";

describe("searchInputSchema (ChatGPT/connector compat)", () => {
  test("parses a query-only input", () => {
    const parsed = searchInputSchema.parse({ query: "typescript" });
    expect(parsed.query).toBe("typescript");
  });

  test("rejects empty query", () => {
    const result = searchInputSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["query"]);
    }
  });

  test("rejects missing query", () => {
    const result = searchInputSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["query"]);
    }
  });
});

describe("searchOutputSchema (ChatGPT/connector compat)", () => {
  test("parses results as [{id, title, url}]", () => {
    const parsed = searchOutputSchema.parse({
      results: [
        {
          id: "th_1",
          title: "Notes on TypeScript",
          url: "https://ob.example.com/t/th_1",
        },
      ],
    });
    expect(parsed.results[0]?.title).toBe("Notes on TypeScript");
  });

  test("rejects a result missing url", () => {
    const result = searchOutputSchema.safeParse({
      results: [{ id: "th_1", title: "x" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["results", 0, "url"]);
    }
  });
});
