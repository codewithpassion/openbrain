import { describe, expect, test } from "bun:test";
import { Thought, ThoughtMetadata } from "../src/thoughts";

const validFingerprint = "a".repeat(64);

describe("ThoughtMetadata", () => {
  test("parses a full valid payload", () => {
    const parsed = ThoughtMetadata.parse({
      type: "observation",
      topics: ["typescript"],
      people: ["alice"],
      action_items: ["follow up"],
      dates_mentioned: ["2026-05-18"],
    });
    expect(parsed.type).toBe("observation");
    expect(parsed.topics).toEqual(["typescript"]);
    expect(parsed.dates_mentioned).toEqual(["2026-05-18"]);
  });

  test("defaults all array fields to empty arrays when omitted", () => {
    const parsed = ThoughtMetadata.parse({});
    expect(parsed.topics).toEqual([]);
    expect(parsed.people).toEqual([]);
    expect(parsed.action_items).toEqual([]);
    expect(parsed.dates_mentioned).toEqual([]);
    expect(parsed.type).toBeUndefined();
  });

  test("rejects an invalid type enum value", () => {
    const result = ThoughtMetadata.safeParse({ type: "nonsense" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["type"]);
      expect(issue?.code).toBe("invalid_value");
    }
  });

  test("rejects a malformed date in dates_mentioned", () => {
    const result = ThoughtMetadata.safeParse({
      dates_mentioned: ["18/05/2026"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["dates_mentioned", 0]);
      expect(issue?.code).toBe("invalid_format");
    }
  });

  test("rejects an empty topic string", () => {
    const result = ThoughtMetadata.safeParse({ topics: [""] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["topics", 0]);
      expect(issue?.code).toBe("too_small");
    }
  });
});

describe("Thought", () => {
  const valid = {
    id: "th_1",
    userId: "user_1",
    content: "Hello world",
    source: "cli",
    embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
    embeddingDims: 1024,
    fingerprint: validFingerprint,
    metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };

  test("parses a canonical valid thought", () => {
    const parsed = Thought.parse(valid);
    expect(parsed.content).toBe("Hello world");
    expect(parsed.embeddingDims).toBe(1024);
  });

  test("rejects content exceeding 50_000 characters", () => {
    const result = Thought.safeParse({ ...valid, content: "x".repeat(50_001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["content"]);
      expect(issue?.code).toBe("too_big");
    }
  });

  test("rejects empty content", () => {
    const result = Thought.safeParse({ ...valid, content: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["content"]);
    }
  });

  test("rejects a malformed fingerprint", () => {
    const result = Thought.safeParse({ ...valid, fingerprint: "not-a-sha256" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(["fingerprint"]);
      expect(issue?.code).toBe("invalid_format");
    }
  });

  test("rejects non-positive embeddingDims", () => {
    const result = Thought.safeParse({ ...valid, embeddingDims: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["embeddingDims"]);
    }
  });

  test("rejects a non-integer embeddingDims", () => {
    const result = Thought.safeParse({ ...valid, embeddingDims: 12.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["embeddingDims"]);
    }
  });

  test("rejects non-positive createdAt", () => {
    const result = Thought.safeParse({ ...valid, createdAt: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["createdAt"]);
    }
  });
});
