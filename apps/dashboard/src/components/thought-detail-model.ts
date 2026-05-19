import { formatRelativeTime, formatTopics } from "../lib/format";

export interface ThoughtDetailLike {
  readonly _id: string;
  readonly content: string;
  readonly source: string;
  readonly embeddingModel: string;
  readonly embeddingDims: number;
  readonly fingerprint: string;
  readonly metadata: {
    readonly type?: string | undefined;
    readonly topics: readonly string[];
    readonly people: readonly string[];
    readonly action_items: readonly string[];
    readonly dates_mentioned: readonly string[];
  };
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ProvenanceLike {
  readonly _id: string;
  readonly origin: "human" | "agent_inferred" | "agent_generated" | "import";
  readonly agent?: string | undefined;
  readonly capturedAt: number;
}

export interface UsePolicyLike {
  readonly trustGrade: "instruction" | "evidence" | "draft";
  readonly scopes: readonly string[];
  readonly expiresAt?: number | undefined;
}

export interface SourceRefLike {
  readonly _id: string;
  readonly kind: string;
  readonly uri: string;
  readonly excerpt?: string | undefined;
}

export interface ReviewLike {
  readonly _id: string;
  readonly status: "unreviewed" | "confirmed" | "rejected" | "needs_revision";
  readonly reviewer: string;
  readonly reviewedAt: number;
  readonly note?: string | undefined;
}

export interface ThoughtDetailInput {
  readonly thought: ThoughtDetailLike;
  readonly provenance: readonly ProvenanceLike[];
  readonly usePolicy: UsePolicyLike | null;
  readonly sourceRefs: readonly SourceRefLike[];
  readonly reviews: readonly ReviewLike[];
}

export interface ThoughtDetailModel {
  readonly id: string;
  readonly content: string;
  readonly typeLabel: string;
  readonly topicsLine: string;
  readonly peopleLine: string;
  readonly actionItems: readonly string[];
  readonly datesMentioned: readonly string[];
  readonly source: string;
  readonly embeddingLabel: string;
  readonly fingerprintShort: string;
  readonly createdLabel: string;
  readonly updatedLabel: string;
  readonly provenance: readonly {
    readonly id: string;
    readonly originLabel: string;
    readonly agentLabel: string | null;
    readonly capturedLabel: string;
  }[];
  readonly trustGradeLabel: string;
  readonly scopesLine: string;
  readonly sourceRefs: readonly {
    readonly id: string;
    readonly kind: string;
    readonly uri: string;
    readonly excerpt: string | null;
  }[];
  readonly reviews: readonly {
    readonly id: string;
    readonly statusLabel: string;
    readonly reviewer: string;
    readonly reviewedLabel: string;
    readonly note: string | null;
  }[];
  readonly canPromoteToInstruction: boolean;
}

const ORIGIN_LABELS: Record<ProvenanceLike["origin"], string> = {
  human: "human",
  agent_inferred: "agent (inferred)",
  agent_generated: "agent (generated)",
  import: "import",
};

const STATUS_LABELS: Record<ReviewLike["status"], string> = {
  unreviewed: "unreviewed",
  confirmed: "confirmed",
  rejected: "rejected",
  needs_revision: "needs revision",
};

/**
 * Pure aggregator: takes the raw shape of all sidecar queries for one thought
 * and produces the view-model the detail page renders. Kept React-free and
 * dependency-free so it tests under `bun test` without a DOM.
 *
 * Promotion gate (CLAUDE.md §7): `canPromoteToInstruction` is true only when
 * the use policy exists and a `confirmed` review exists for this thought.
 */
export function buildThoughtDetailModel(
  input: ThoughtDetailInput,
  now: number = Date.now(),
): ThoughtDetailModel {
  const { thought, provenance, usePolicy, sourceRefs, reviews } = input;
  const reviewsByCreation = [...reviews].sort((a, b) => b.reviewedAt - a.reviewedAt);
  const hasConfirmedReview = reviews.some((r) => r.status === "confirmed");
  const canPromoteToInstruction =
    usePolicy !== null && usePolicy.trustGrade !== "instruction" && hasConfirmedReview;

  return {
    id: thought._id,
    content: thought.content,
    typeLabel: thought.metadata.type ?? "thought",
    topicsLine: formatTopics(thought.metadata.topics),
    peopleLine: thought.metadata.people.join(", "),
    actionItems: thought.metadata.action_items,
    datesMentioned: thought.metadata.dates_mentioned,
    source: thought.source,
    embeddingLabel: `${thought.embeddingModel} · ${thought.embeddingDims}d`,
    fingerprintShort: thought.fingerprint.slice(0, 12),
    createdLabel: formatRelativeTime(thought.createdAt, now),
    updatedLabel: formatRelativeTime(thought.updatedAt, now),
    provenance: provenance.map((p) => ({
      id: p._id,
      originLabel: ORIGIN_LABELS[p.origin],
      agentLabel: p.agent ?? null,
      capturedLabel: formatRelativeTime(p.capturedAt, now),
    })),
    trustGradeLabel: usePolicy === null ? "no policy" : usePolicy.trustGrade,
    scopesLine: usePolicy === null ? "" : usePolicy.scopes.join(", "),
    sourceRefs: sourceRefs.map((s) => ({
      id: s._id,
      kind: s.kind,
      uri: s.uri,
      excerpt: s.excerpt ?? null,
    })),
    reviews: reviewsByCreation.map((r) => ({
      id: r._id,
      statusLabel: STATUS_LABELS[r.status],
      reviewer: r.reviewer,
      reviewedLabel: formatRelativeTime(r.reviewedAt, now),
      note: r.note ?? null,
    })),
    canPromoteToInstruction,
  };
}
