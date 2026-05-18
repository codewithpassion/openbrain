import { describe, expect, test } from "bun:test";
import { listThoughtsInputSchema, listThoughtsOutputSchema } from "../../src/tools/list-thoughts";

describe("listThoughtsInputSchema", () => {
  test("parses a fully populated input", () => {
    const parsed = listThoughtsInputSchema.parse({
      limit: 25,
      days: 7,
      type: "task",
      topic: "typescript",
      person: "alice",
    });
    expect(parsed.limit).toBe(25);
    expect(parsed.days).toBe(7);
  });

  test("applies a default limit when omitted", () => {
    const parsed = listThoughtsInputSchema.parse({});
    expect(parsed.limit).toBeGreaterThan(0);
    expect(parsed.limit).toBeLessThanOrEqual(100);
  });

  test("rejects limit = 101", () => {
    const result = listThoughtsInputSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["limit"]);
      expect(issue?.code).toBe("too_big");
    }
  });

  test("rejects days < 1", () => {
    const result = listThoughtsInputSchema.safeParse({ days: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["days"]);
    }
  });

  test("rejects an unknown type enum value", () => {
    const result = listThoughtsInputSchema.safeParse({ type: "nonsense" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["type"]);
    }
  });
});

describe("listThoughtsOutputSchema", () => {
  test("parses a thoughts array", () => {
    const parsed = listThoughtsOutputSchema.parse({
      thoughts: [
        {
          id: "th_1",
          content: "x",
          source: "cli",
          createdAt: 1_700_000_000_000,
          type: "task",
        },
      ],
    });
    expect(parsed.thoughts[0]?.type).toBe("task");
  });
});
