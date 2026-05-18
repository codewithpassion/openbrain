import { describe, expect, test } from "bun:test";
import { normalizeForFingerprint } from "../src/normalize";

describe("normalizeForFingerprint", () => {
  test("lowercases the string", () => {
    expect(normalizeForFingerprint("Hello World")).toBe("hello world");
  });

  test("trims leading and trailing whitespace", () => {
    expect(normalizeForFingerprint("  hello  ")).toBe("hello");
  });

  test("collapses interior whitespace runs to a single space", () => {
    expect(normalizeForFingerprint("hello   world")).toBe("hello world");
  });

  test("collapses tabs and newlines as whitespace", () => {
    expect(normalizeForFingerprint("hello\t\n  world")).toBe("hello world");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(normalizeForFingerprint("   \n\t  ")).toBe("");
  });
});
