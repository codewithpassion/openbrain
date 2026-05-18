import { describe, expect, test } from "bun:test";
import {
  captureThoughtInputSchema,
  captureThoughtOutputSchema,
} from "../../src/tools/capture-thought";

describe("captureThoughtInputSchema", () => {
  test("parses a canonical valid input", () => {
    const parsed = captureThoughtInputSchema.parse({
      content: "Remember to email Bob",
      source: "cli",
    });
    expect(parsed.content).toBe("Remember to email Bob");
    expect(parsed.source).toBe("cli");
  });

  test("accepts content at exactly 50_000 characters", () => {
    const parsed = captureThoughtInputSchema.parse({
      content: "x".repeat(50_000),
      source: "cli",
    });
    expect(parsed.content.length).toBe(50_000);
  });

  test("rejects content > 50_000 characters", () => {
    const result = captureThoughtInputSchema.safeParse({
      content: "x".repeat(50_001),
      source: "cli",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["content"]);
      expect(issue?.code).toBe("too_big");
    }
  });

  test("rejects empty content", () => {
    const result = captureThoughtInputSchema.safeParse({ content: "", source: "cli" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["content"]);
    }
  });

  test("rejects empty source", () => {
    const result = captureThoughtInputSchema.safeParse({ content: "x", source: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["source"]);
    }
  });
});

describe("captureThoughtOutputSchema", () => {
  test("parses a valid result with thoughtId", () => {
    const parsed = captureThoughtOutputSchema.parse({
      thoughtId: "th_1",
      duplicate: false,
    });
    expect(parsed.duplicate).toBe(false);
  });

  test("rejects missing thoughtId", () => {
    const result = captureThoughtOutputSchema.safeParse({ duplicate: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["thoughtId"]);
    }
  });
});
