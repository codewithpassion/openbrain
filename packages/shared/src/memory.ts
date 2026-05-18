import { z } from "zod";
import { ThoughtId, UserId } from "./ids";

const NonEmptyString = z.string().min(1);
const PositiveNumber = z.number().positive();

const Base = z.object({
  thoughtId: ThoughtId,
  userId: UserId,
});

export const MemoryOrigin = z.enum(["human", "agent_inferred", "agent_generated", "import"]);
export type MemoryOrigin = z.infer<typeof MemoryOrigin>;

export const MemoryProvenance = Base.extend({
  origin: MemoryOrigin,
  agent: NonEmptyString.optional(),
  agentVersion: NonEmptyString.optional(),
  sessionId: NonEmptyString.optional(),
  capturedAt: PositiveNumber,
});
export type MemoryProvenance = z.infer<typeof MemoryProvenance>;

export const MemoryReviewStatus = z.enum(["unreviewed", "confirmed", "rejected", "needs_revision"]);
export type MemoryReviewStatus = z.infer<typeof MemoryReviewStatus>;

export const MemoryReview = Base.extend({
  status: MemoryReviewStatus,
  reviewer: NonEmptyString,
  reviewedAt: PositiveNumber,
  note: NonEmptyString.optional(),
});
export type MemoryReview = z.infer<typeof MemoryReview>;

export const TrustGrade = z.enum(["instruction", "evidence", "draft"]);
export type TrustGrade = z.infer<typeof TrustGrade>;

export const MemoryUsePolicy = Base.extend({
  trustGrade: TrustGrade,
  scopes: z.array(NonEmptyString).default([]),
  expiresAt: PositiveNumber.optional(),
});
export type MemoryUsePolicy = z.infer<typeof MemoryUsePolicy>;

export const MemorySourceRef = Base.extend({
  kind: NonEmptyString,
  uri: NonEmptyString,
  excerpt: NonEmptyString.optional(),
});
export type MemorySourceRef = z.infer<typeof MemorySourceRef>;

export const MemoryRecallTrace = Base.extend({
  query: NonEmptyString,
  score: z.number().min(0).max(1),
  clientId: NonEmptyString,
  at: PositiveNumber,
});
export type MemoryRecallTrace = z.infer<typeof MemoryRecallTrace>;

export const MemoryAudit = Base.extend({
  action: NonEmptyString,
  actor: NonEmptyString,
  at: PositiveNumber,
  diff: z.unknown(),
});
export type MemoryAudit = z.infer<typeof MemoryAudit>;
