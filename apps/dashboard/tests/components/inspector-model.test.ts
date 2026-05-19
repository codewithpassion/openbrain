import { describe, expect, it } from "bun:test";
import {
  buildInspectorRowModels,
  type InspectorReviewLike,
  nextInspectorFilter,
} from "../../src/components/inspector-model";

const NOW = Date.UTC(2026, 4, 18, 12, 0, 0);

function makeRow(over: Partial<InspectorReviewLike>): InspectorReviewLike {
  return {
    _id: "r0",
    thoughtId: "t0",
    status: "unreviewed",
    reviewer: "u_a",
    reviewedAt: NOW,
    _creationTime: NOW,
    ...over,
  };
}

describe("buildInspectorRowModels", () => {
  it("maps confirmed to a success badge with a humanized label", () => {
    const [row] = buildInspectorRowModels([makeRow({ status: "confirmed" })], NOW);
    expect(row?.statusLabel).toBe("confirmed");
    expect(row?.statusKind).toBe("success");
  });

  it("maps needs_revision to a warning badge with the spaced label", () => {
    const [row] = buildInspectorRowModels([makeRow({ status: "needs_revision" })], NOW);
    expect(row?.statusLabel).toBe("needs revision");
    expect(row?.statusKind).toBe("warning");
  });

  it("formats the relative time and preserves the optional note", () => {
    const tenMinAgo = NOW - 10 * 60_000;
    const [row] = buildInspectorRowModels(
      [makeRow({ reviewedAt: tenMinAgo, note: "looks ok" })],
      NOW,
    );
    expect(row?.relativeTime).toBe("10 min ago");
    expect(row?.note).toBe("looks ok");
  });

  it("returns null for missing notes (not undefined)", () => {
    const [row] = buildInspectorRowModels([makeRow({ note: undefined })], NOW);
    expect(row?.note).toBe(null);
  });
});

describe("nextInspectorFilter", () => {
  it("accepts the known filter strings", () => {
    expect(nextInspectorFilter("all", "confirmed")).toBe("confirmed");
    expect(nextInspectorFilter("confirmed", "needs_revision")).toBe("needs_revision");
    expect(nextInspectorFilter("rejected", "all")).toBe("all");
  });

  it("keeps the current filter when given an unknown string", () => {
    expect(nextInspectorFilter("confirmed", "garbage")).toBe("confirmed");
  });
});
