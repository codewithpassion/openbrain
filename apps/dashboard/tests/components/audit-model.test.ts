import { describe, expect, it } from "bun:test";
import {
  type AuditRowLike,
  buildAuditRowModels,
  summarizeDiff,
} from "../../src/components/audit-model";

const NOW = Date.UTC(2026, 4, 18, 12, 0, 0);

describe("summarizeDiff", () => {
  it("returns '(no diff)' for null and undefined", () => {
    expect(summarizeDiff(null)).toBe("(no diff)");
    expect(summarizeDiff(undefined)).toBe("(no diff)");
  });

  it("returns short strings as-is", () => {
    expect(summarizeDiff("hello")).toBe("hello");
  });

  it("truncates long strings with an ellipsis", () => {
    const long = "x".repeat(200);
    const out = summarizeDiff(long);
    expect(out).toHaveLength(161); // 160 + "…"
    expect(out.endsWith("…")).toBe(true);
  });

  it("stringifies plain objects compactly", () => {
    expect(summarizeDiff({ a: 1, b: "two" })).toBe('{"a":1,"b":"two"}');
  });

  it("stringifies arrays compactly", () => {
    expect(summarizeDiff([1, 2, 3])).toBe("[1,2,3]");
  });

  it("falls back to String() for primitives that aren't strings or objects", () => {
    expect(summarizeDiff(42)).toBe("42");
    expect(summarizeDiff(true)).toBe("true");
  });
});

describe("buildAuditRowModels", () => {
  it("projects rows with relative time and null-coalesced thoughtId", () => {
    const rows: AuditRowLike[] = [
      {
        _id: "a1",
        thoughtId: "t1",
        action: "thought.create",
        actor: "u_a",
        at: NOW - 5 * 60_000,
        diff: { content: "x" },
      },
      {
        _id: "a2",
        action: "review.promote",
        actor: "u_a",
        at: NOW - 60_000,
        diff: { trustGrade: "instruction" },
      },
    ];
    const models = buildAuditRowModels(rows, NOW);
    expect(models).toHaveLength(2);
    expect(models[0]?.thoughtId).toBe("t1");
    expect(models[0]?.relativeTime).toBe("5 min ago");
    expect(models[1]?.thoughtId).toBe(null);
    expect(models[1]?.diffSummary).toBe('{"trustGrade":"instruction"}');
  });
});
