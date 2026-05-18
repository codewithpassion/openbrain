import { describe, expect, it } from "bun:test";
import { validateCapture } from "../../src/components/quick-capture-model";

describe("validateCapture", () => {
  it("rejects empty input", () => {
    const result = validateCapture("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Write something first.");
    }
  });

  it("rejects whitespace-only input", () => {
    const result = validateCapture("   \n\t ");
    expect(result.ok).toBe(false);
  });

  it("accepts a normal thought and trims surrounding whitespace", () => {
    const result = validateCapture("  hello world  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("hello world");
    }
  });

  it("rejects inputs longer than the per-thought ceiling", () => {
    const tooLong = "a".repeat(50_001);
    const result = validateCapture(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/50,?000/);
    }
  });
});
