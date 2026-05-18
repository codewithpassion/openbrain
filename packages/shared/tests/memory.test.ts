import { describe, expect, test } from "bun:test";
import {
  MemoryAudit,
  MemoryProvenance,
  MemoryRecallTrace,
  MemoryReview,
  MemorySourceRef,
  MemoryUsePolicy,
} from "../src/memory";

const ids = { thoughtId: "th_1", userId: "user_1" };

describe("MemoryProvenance", () => {
  test("parses a valid record", () => {
    const parsed = MemoryProvenance.parse({
      ...ids,
      origin: "human",
      capturedAt: 1_700_000_000_000,
    });
    expect(parsed.origin).toBe("human");
    expect(parsed.agent).toBeUndefined();
  });

  test("rejects an unknown origin", () => {
    const result = MemoryProvenance.safeParse({
      ...ids,
      origin: "alien",
      capturedAt: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["origin"]);
    }
  });

  test("rejects non-positive capturedAt", () => {
    const result = MemoryProvenance.safeParse({
      ...ids,
      origin: "human",
      capturedAt: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["capturedAt"]);
    }
  });
});

describe("MemoryReview", () => {
  test("parses a valid record", () => {
    const parsed = MemoryReview.parse({
      ...ids,
      status: "confirmed",
      reviewer: "user_1",
      reviewedAt: 1_700_000_000_000,
    });
    expect(parsed.status).toBe("confirmed");
  });

  test("rejects unknown status", () => {
    const result = MemoryReview.safeParse({
      ...ids,
      status: "maybe",
      reviewer: "user_1",
      reviewedAt: 1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty reviewer", () => {
    const result = MemoryReview.safeParse({
      ...ids,
      status: "confirmed",
      reviewer: "",
      reviewedAt: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["reviewer"]);
    }
  });
});

describe("MemoryUsePolicy", () => {
  test("accepts all three trust grades", () => {
    for (const trustGrade of ["instruction", "evidence", "draft"] as const) {
      const parsed = MemoryUsePolicy.parse({ ...ids, trustGrade, scopes: ["personal"] });
      expect(parsed.trustGrade).toBe(trustGrade);
    }
  });

  test("rejects an unknown trust grade", () => {
    const result = MemoryUsePolicy.safeParse({
      ...ids,
      trustGrade: "gospel",
      scopes: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["trustGrade"]);
    }
  });

  test("defaults scopes to an empty array when omitted", () => {
    const parsed = MemoryUsePolicy.parse({ ...ids, trustGrade: "evidence" });
    expect(parsed.scopes).toEqual([]);
  });
});

describe("MemorySourceRef", () => {
  test("parses a valid ref", () => {
    const parsed = MemorySourceRef.parse({
      ...ids,
      kind: "url",
      uri: "https://example.com",
    });
    expect(parsed.uri).toBe("https://example.com");
  });

  test("rejects empty uri", () => {
    const result = MemorySourceRef.safeParse({ ...ids, kind: "url", uri: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["uri"]);
    }
  });
});

describe("MemoryRecallTrace", () => {
  test("parses a valid trace", () => {
    const parsed = MemoryRecallTrace.parse({
      ...ids,
      query: "typescript",
      score: 0.87,
      clientId: "claude-desktop",
      at: 1_700_000_000_000,
    });
    expect(parsed.score).toBe(0.87);
  });

  test("rejects score above 1", () => {
    const result = MemoryRecallTrace.safeParse({
      ...ids,
      query: "x",
      score: 1.5,
      clientId: "c",
      at: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["score"]);
    }
  });

  test("rejects negative score", () => {
    const result = MemoryRecallTrace.safeParse({
      ...ids,
      query: "x",
      score: -0.1,
      clientId: "c",
      at: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("MemoryAudit", () => {
  test("parses a valid entry with arbitrary diff", () => {
    const parsed = MemoryAudit.parse({
      ...ids,
      action: "promote_evidence_to_instruction",
      actor: "user_1",
      at: 1_700_000_000_000,
      diff: { trustGrade: { from: "evidence", to: "instruction" } },
    });
    expect(parsed.action).toBe("promote_evidence_to_instruction");
  });

  test("rejects missing actor", () => {
    const result = MemoryAudit.safeParse({
      ...ids,
      action: "x",
      at: 1,
      diff: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["actor"]);
    }
  });
});
