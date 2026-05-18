import { describe, expect, test } from "bun:test";
import { memoryReviewInputSchema, memoryReviewOutputSchema } from "../../src/tools/memory-review";

describe("memoryReviewInputSchema", () => {
  test("parses a confirm-with-promotion input", () => {
    const parsed = memoryReviewInputSchema.parse({
      thoughtId: "th_1",
      status: "confirmed",
      promoteTo: "instruction",
    });
    expect(parsed.status).toBe("confirmed");
    expect(parsed.promoteTo).toBe("instruction");
  });

  test("parses a rejection with a note", () => {
    const parsed = memoryReviewInputSchema.parse({
      thoughtId: "th_1",
      status: "rejected",
      note: "incorrect inference",
    });
    expect(parsed.status).toBe("rejected");
  });

  test("rejects an unknown status", () => {
    const result = memoryReviewInputSchema.safeParse({
      thoughtId: "th_1",
      status: "maybe",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["status"]);
    }
  });

  test("rejects an unknown promoteTo", () => {
    const result = memoryReviewInputSchema.safeParse({
      thoughtId: "th_1",
      status: "confirmed",
      promoteTo: "gospel",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["promoteTo"]);
    }
  });

  test("rejects empty thoughtId", () => {
    const result = memoryReviewInputSchema.safeParse({
      thoughtId: "",
      status: "confirmed",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["thoughtId"]);
    }
  });
});

describe("memoryReviewOutputSchema", () => {
  test("parses a valid result", () => {
    const parsed = memoryReviewOutputSchema.parse({
      thoughtId: "th_1",
      status: "confirmed",
      trustGrade: "instruction",
    });
    expect(parsed.trustGrade).toBe("instruction");
  });

  test("rejects an unknown status", () => {
    const result = memoryReviewOutputSchema.safeParse({
      thoughtId: "th_1",
      status: "maybe",
      trustGrade: "evidence",
    });
    expect(result.success).toBe(false);
  });
});
