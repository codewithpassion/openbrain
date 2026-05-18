import { describe, expect, test } from "bun:test";
import {
  memoryWritebackInputSchema,
  memoryWritebackOutputSchema,
} from "../../src/tools/memory-writeback";

describe("memoryWritebackInputSchema", () => {
  test("parses a canonical valid input", () => {
    const parsed = memoryWritebackInputSchema.parse({
      content: "The user prefers tabs over spaces",
      source: "mcp",
      origin: "agent_inferred",
    });
    expect(parsed.content).toBe("The user prefers tabs over spaces");
    expect(parsed.origin).toBe("agent_inferred");
  });

  test("defaults trustGrade to 'evidence' when omitted", () => {
    const parsed = memoryWritebackInputSchema.parse({
      content: "x",
      source: "mcp",
      origin: "agent_inferred",
    });
    expect(parsed.trustGrade).toBe("evidence");
  });

  test("accepts explicit trustGrade='draft'", () => {
    const parsed = memoryWritebackInputSchema.parse({
      content: "x",
      source: "mcp",
      origin: "agent_inferred",
      trustGrade: "draft",
    });
    expect(parsed.trustGrade).toBe("draft");
  });

  test("rejects trustGrade='instruction' on writeback (must come via memory_review)", () => {
    const result = memoryWritebackInputSchema.safeParse({
      content: "x",
      source: "mcp",
      origin: "agent_inferred",
      trustGrade: "instruction",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["trustGrade"]);
      expect(issue?.code).toBe("invalid_value");
    }
  });

  test("rejects content > 50_000 characters", () => {
    const result = memoryWritebackInputSchema.safeParse({
      content: "x".repeat(50_001),
      source: "mcp",
      origin: "agent_inferred",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["content"]);
    }
  });

  test("rejects an unknown origin", () => {
    const result = memoryWritebackInputSchema.safeParse({
      content: "x",
      source: "mcp",
      origin: "alien",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["origin"]);
    }
  });
});

describe("memoryWritebackOutputSchema", () => {
  test("parses a valid result", () => {
    const parsed = memoryWritebackOutputSchema.parse({
      thoughtId: "th_1",
      trustGrade: "evidence",
    });
    expect(parsed.trustGrade).toBe("evidence");
  });

  test("rejects an instruction-grade output (writeback never returns instruction)", () => {
    const result = memoryWritebackOutputSchema.safeParse({
      thoughtId: "th_1",
      trustGrade: "instruction",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["trustGrade"]);
    }
  });
});
