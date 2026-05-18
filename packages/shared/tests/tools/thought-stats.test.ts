import { describe, expect, test } from "bun:test";
import { thoughtStatsInputSchema, thoughtStatsOutputSchema } from "../../src/tools/thought-stats";

describe("thoughtStatsInputSchema", () => {
  test("parses an empty input (all fields optional)", () => {
    const parsed = thoughtStatsInputSchema.parse({});
    expect(parsed).toBeDefined();
  });

  test("accepts a days filter", () => {
    const parsed = thoughtStatsInputSchema.parse({ days: 30 });
    expect(parsed.days).toBe(30);
  });

  test("rejects days < 1", () => {
    const result = thoughtStatsInputSchema.safeParse({ days: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["days"]);
    }
  });

  test("rejects a non-integer days", () => {
    const result = thoughtStatsInputSchema.safeParse({ days: 3.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["days"]);
    }
  });
});

describe("thoughtStatsOutputSchema", () => {
  test("parses a valid stats payload", () => {
    const parsed = thoughtStatsOutputSchema.parse({
      total: 42,
      byType: { task: 10, idea: 3 },
      topTopics: [{ topic: "typescript", count: 7 }],
      topPeople: [{ person: "alice", count: 4 }],
    });
    expect(parsed.total).toBe(42);
    expect(parsed.topTopics[0]?.topic).toBe("typescript");
  });

  test("rejects a negative total", () => {
    const result = thoughtStatsOutputSchema.safeParse({
      total: -1,
      byType: {},
      topTopics: [],
      topPeople: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["total"]);
    }
  });

  test("rejects a non-integer count in topTopics", () => {
    const result = thoughtStatsOutputSchema.safeParse({
      total: 1,
      byType: {},
      topTopics: [{ topic: "ts", count: 1.5 }],
      topPeople: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["topTopics", 0, "count"]);
    }
  });
});
