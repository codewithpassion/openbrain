import { describe, expect, test } from "bun:test";
import { tokenOverlapScore } from "../../lib/scorer";

describe("tokenOverlapScore", () => {
  test("returns 1 when query is a strict token subset of content", () => {
    const score = tokenOverlapScore("My dog Luna eats kibble", "dog Luna");
    expect(score).toBe(1);
  });

  test("returns 0 when there is no token overlap", () => {
    const score = tokenOverlapScore("Banana smoothie recipe", "tax return deadline");
    expect(score).toBe(0);
  });

  test("ignores case and punctuation", () => {
    const score = tokenOverlapScore("Met with Priya about Vectorize.", "vectorize PRIYA");
    expect(score).toBe(1);
  });

  test("partial overlap returns a fraction between 0 and 1", () => {
    const score = tokenOverlapScore("alpha beta gamma delta", "alpha epsilon");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  test("empty query yields 0", () => {
    const score = tokenOverlapScore("anything", "");
    expect(score).toBe(0);
  });

  test("stop words don't dominate the score", () => {
    // "the" appears in many contents but shouldn't be enough on its own.
    const score = tokenOverlapScore("buy more bananas at the store", "the");
    expect(score).toBe(0);
  });
});
