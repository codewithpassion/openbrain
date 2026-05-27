import { describe, expect, it } from "bun:test";
import { slugifyName, validateProjectInput } from "../../src/components/new-project-dialog-model";

describe("slugifyName", () => {
  it("lowercases and replaces whitespace with hyphens", () => {
    expect(slugifyName("My Project")).toBe("my-project");
  });

  it("strips punctuation and emoji", () => {
    expect(slugifyName("Acme & Co!")).toBe("acme-co");
  });

  it("collapses runs of separators into a single hyphen", () => {
    expect(slugifyName("a   b___c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyName("---hello---")).toBe("hello");
  });

  it("returns empty string when nothing alphanumeric remains", () => {
    expect(slugifyName("!!!")).toBe("");
  });

  it("caps the result at 64 characters", () => {
    expect(slugifyName("a".repeat(80))).toHaveLength(64);
  });
});

describe("validateProjectInput", () => {
  it("rejects empty name", () => {
    const result = validateProjectInput({ name: "  ", slug: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/name/i);
    }
  });

  it("rejects empty slug", () => {
    const result = validateProjectInput({ name: "Work", slug: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/slug/i);
    }
  });

  it("rejects slug with invalid characters", () => {
    const result = validateProjectInput({ name: "Work", slug: "My Project" });
    expect(result.ok).toBe(false);
  });

  it("rejects slug longer than 64 characters", () => {
    const result = validateProjectInput({ name: "Work", slug: "a".repeat(65) });
    expect(result.ok).toBe(false);
  });

  it("rejects slug starting with a hyphen", () => {
    const result = validateProjectInput({ name: "Work", slug: "-work" });
    expect(result.ok).toBe(false);
  });

  it("accepts a valid name + slug pair and trims surrounding whitespace", () => {
    const result = validateProjectInput({ name: "  Work  ", slug: "work" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).toBe("Work");
      expect(result.slug).toBe("work");
    }
  });
});
