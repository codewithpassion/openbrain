import { describe, expect, it } from "bun:test";
import { formatRelativeTime, formatTopics, truncate } from "../../src/lib/format";

describe("truncate", () => {
  it("returns the input unchanged when shorter than the limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("cuts and appends an ellipsis when longer than the limit", () => {
    expect(truncate("the quick brown fox", 9)).toBe("the quick…");
  });

  it("returns the empty string for an empty input", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 4, 18, 12, 0, 0);

  it("renders 'just now' for timestamps within the last 45 seconds", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("just now");
  });

  it("renders minutes ago for timestamps within the last hour", () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
  });

  it("renders hours ago for timestamps within the last day", () => {
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe("3 hr ago");
  });

  it("renders days ago for older timestamps within a week", () => {
    expect(formatRelativeTime(now - 4 * 24 * 60 * 60_000, now)).toBe("4 days ago");
  });

  it("renders an ISO date for timestamps older than a week", () => {
    expect(formatRelativeTime(Date.UTC(2026, 0, 1), now)).toBe("2026-01-01");
  });
});

describe("formatTopics", () => {
  it("returns an empty string when no topics are provided", () => {
    expect(formatTopics([])).toBe("");
  });

  it("joins topics with a bullet separator", () => {
    expect(formatTopics(["focus", "memory"])).toBe("focus · memory");
  });
});
