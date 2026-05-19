import { describe, expect, it } from "bun:test";
import {
  buildThoughtDetailModel,
  type ProvenanceLike,
  type ReviewLike,
  type SourceRefLike,
  type ThoughtDetailLike,
  type UsePolicyLike,
} from "../../src/components/thought-detail-model";

const NOW = Date.UTC(2026, 4, 18, 12, 0, 0);

const baseThought: ThoughtDetailLike = {
  _id: "t1",
  content: "Investigate the Workers AI Qwen3 embeddings.",
  source: "dashboard",
  embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
  embeddingDims: 1024,
  fingerprint: "abcdef0123456789".padEnd(64, "0"),
  metadata: {
    type: "idea",
    topics: ["workers", "ai"],
    people: ["dom"],
    action_items: ["read the qwen3 paper", "compare against bge-base"],
    dates_mentioned: ["2026-05-20"],
  },
  createdAt: Date.UTC(2026, 4, 18, 11, 0, 0),
  updatedAt: Date.UTC(2026, 4, 18, 11, 30, 0),
};

describe("buildThoughtDetailModel", () => {
  it("formats the core thought labels", () => {
    const model = buildThoughtDetailModel(
      { thought: baseThought, provenance: [], usePolicy: null, sourceRefs: [], reviews: [] },
      NOW,
    );
    expect(model.typeLabel).toBe("idea");
    expect(model.topicsLine).toBe("workers · ai");
    expect(model.peopleLine).toBe("dom");
    expect(model.embeddingLabel).toBe("@cf/qwen/qwen3-embedding-0.6b · 1024d");
    expect(model.fingerprintShort).toHaveLength(12);
    expect(model.createdLabel).toBe("1 hr ago");
    expect(model.updatedLabel).toBe("30 min ago");
  });

  it("labels trust grade as 'no policy' when usePolicy is null", () => {
    const model = buildThoughtDetailModel(
      { thought: baseThought, provenance: [], usePolicy: null, sourceRefs: [], reviews: [] },
      NOW,
    );
    expect(model.trustGradeLabel).toBe("no policy");
    expect(model.scopesLine).toBe("");
  });

  it("renders trust grade and scopes when a policy exists", () => {
    const policy: UsePolicyLike = {
      trustGrade: "evidence",
      scopes: ["personal", "work"],
    };
    const model = buildThoughtDetailModel(
      { thought: baseThought, provenance: [], usePolicy: policy, sourceRefs: [], reviews: [] },
      NOW,
    );
    expect(model.trustGradeLabel).toBe("evidence");
    expect(model.scopesLine).toBe("personal, work");
  });

  it("formats provenance origin labels and orders rows as given", () => {
    const provenance: ProvenanceLike[] = [
      { _id: "p1", origin: "human", capturedAt: NOW - 60_000 },
      {
        _id: "p2",
        origin: "agent_inferred",
        agent: "claude-opus-4-7",
        capturedAt: NOW - 5 * 60_000,
      },
    ];
    const model = buildThoughtDetailModel(
      { thought: baseThought, provenance, usePolicy: null, sourceRefs: [], reviews: [] },
      NOW,
    );
    expect(model.provenance).toHaveLength(2);
    expect(model.provenance[0]?.originLabel).toBe("human");
    expect(model.provenance[0]?.agentLabel).toBe(null);
    expect(model.provenance[1]?.originLabel).toBe("agent (inferred)");
    expect(model.provenance[1]?.agentLabel).toBe("claude-opus-4-7");
  });

  it("renders source refs with null-coalesced excerpt", () => {
    const refs: SourceRefLike[] = [
      { _id: "s1", kind: "url", uri: "https://x.example/post/1" },
      { _id: "s2", kind: "file", uri: "/notes/2026-05.md", excerpt: "L42: workers ai notes" },
    ];
    const model = buildThoughtDetailModel(
      { thought: baseThought, provenance: [], usePolicy: null, sourceRefs: refs, reviews: [] },
      NOW,
    );
    expect(model.sourceRefs).toHaveLength(2);
    expect(model.sourceRefs[0]?.excerpt).toBe(null);
    expect(model.sourceRefs[1]?.excerpt).toBe("L42: workers ai notes");
  });

  it("orders reviews newest-first and humanizes status labels", () => {
    const older = NOW - 2 * 60 * 60 * 1000;
    const newer = NOW - 10 * 60 * 1000;
    const reviews: ReviewLike[] = [
      { _id: "r1", status: "needs_revision", reviewer: "u_a", reviewedAt: older },
      { _id: "r2", status: "confirmed", reviewer: "u_a", reviewedAt: newer, note: "ok" },
    ];
    const model = buildThoughtDetailModel(
      { thought: baseThought, provenance: [], usePolicy: null, sourceRefs: [], reviews },
      NOW,
    );
    expect(model.reviews.map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(model.reviews[0]?.statusLabel).toBe("confirmed");
    expect(model.reviews[1]?.statusLabel).toBe("needs revision");
  });

  it("allows promotion only when a confirmed review exists and policy is not already instruction", () => {
    const confirmedReview: ReviewLike = {
      _id: "r1",
      status: "confirmed",
      reviewer: "u_a",
      reviewedAt: NOW,
    };
    const evidencePolicy: UsePolicyLike = { trustGrade: "evidence", scopes: [] };
    const instructionPolicy: UsePolicyLike = { trustGrade: "instruction", scopes: [] };

    const promotable = buildThoughtDetailModel(
      {
        thought: baseThought,
        provenance: [],
        usePolicy: evidencePolicy,
        sourceRefs: [],
        reviews: [confirmedReview],
      },
      NOW,
    );
    expect(promotable.canPromoteToInstruction).toBe(true);

    const alreadyInstruction = buildThoughtDetailModel(
      {
        thought: baseThought,
        provenance: [],
        usePolicy: instructionPolicy,
        sourceRefs: [],
        reviews: [confirmedReview],
      },
      NOW,
    );
    expect(alreadyInstruction.canPromoteToInstruction).toBe(false);

    const noConfirmed = buildThoughtDetailModel(
      {
        thought: baseThought,
        provenance: [],
        usePolicy: evidencePolicy,
        sourceRefs: [],
        reviews: [{ ...confirmedReview, status: "needs_revision" }],
      },
      NOW,
    );
    expect(noConfirmed.canPromoteToInstruction).toBe(false);

    const noPolicy = buildThoughtDetailModel(
      {
        thought: baseThought,
        provenance: [],
        usePolicy: null,
        sourceRefs: [],
        reviews: [confirmedReview],
      },
      NOW,
    );
    expect(noPolicy.canPromoteToInstruction).toBe(false);
  });
});
