/**
 * Zod schemas for the Convex HTTP surface (see `packages/convex/convex/http.ts`).
 *
 * Every parsed response in `src/deps/convex.ts` crosses this boundary so the
 * tool layer never sees raw `unknown`. Shapes that overlap with
 * `@openbrains/shared` (`ThoughtMetadata`, `MemoryOrigin`, `TrustGrade`,
 * `MemoryReviewStatus`) are reused, not redeclared.
 *
 * The Convex source-of-truth has primacy: where Convex's response uses a field
 * name that differs from a shared schema (e.g. `topPeople[].name` vs shared's
 * `topPeople[].person`), the wire schema here matches Convex and the tool
 * layer adapts.
 */
import { MemoryOrigin, MemoryReviewStatus, ThoughtMetadata, TrustGrade } from "@openbrains/shared";
import { z } from "zod";

/** A Convex `Doc<"thoughts">` row. Convex always adds `_id` and `_creationTime`. */
export const ConvexThoughtRowSchema = z.object({
  _id: z.string().min(1),
  _creationTime: z.number().optional(),
  userId: z.string().min(1),
  content: z.string().min(1),
  source: z.string().min(1),
  scope: z.string().optional(),
  vectorizeId: z.string().optional(),
  embeddingModel: z.string().min(1),
  embeddingDims: z.number().int().positive(),
  fingerprint: z.string().min(1),
  metadata: ThoughtMetadata,
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
});
export type ConvexThoughtRow = z.infer<typeof ConvexThoughtRowSchema>;

/** `{ id: string }` — POST /api/thoughts response. */
export const CaptureResponseSchema = z.object({ id: z.string().min(1) });

/** `{ rows: ConvexThoughtRow[] }` — POST /api/thoughts/search + /list. */
export const ThoughtRowsResponseSchema = z.object({
  rows: z.array(ConvexThoughtRowSchema),
});

/** `{ thought: ConvexThoughtRow | null }` — POST /api/thoughts/by-fingerprint. */
export const ByFingerprintResponseSchema = z.object({
  thought: ConvexThoughtRowSchema.nullable(),
});

/** GET /api/thoughts/stats. Note: Convex uses `name`, not `person`. */
export const ThoughtStatsResponseSchema = z.object({
  total: z.number().int().min(0),
  byType: z.record(z.string().min(1), z.number().int().min(0)),
  topTopics: z.array(
    z.object({
      topic: z.string().min(1),
      count: z.number().int().min(0),
    }),
  ),
  topPeople: z.array(
    z.object({
      name: z.string().min(1),
      count: z.number().int().min(0),
    }),
  ),
});
export type ThoughtStatsResponse = z.infer<typeof ThoughtStatsResponseSchema>;

const ProvenanceRowSchema = z.object({
  _id: z.string().min(1),
  _creationTime: z.number().optional(),
  thoughtId: z.string().min(1),
  userId: z.string().min(1),
  origin: MemoryOrigin,
  agent: z.string().min(1).optional(),
  agentVersion: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  capturedAt: z.number(),
});

const UsePolicyRowSchema = z.object({
  _id: z.string().min(1),
  _creationTime: z.number().optional(),
  thoughtId: z.string().min(1),
  userId: z.string().min(1),
  trustGrade: TrustGrade,
  scopes: z.array(z.string().min(1)),
  expiresAt: z.number().optional(),
});

/** POST /api/memory/recall response. */
export const MemoryRecallResponseSchema = z.object({
  items: z.array(
    z.object({
      thought: ConvexThoughtRowSchema,
      provenance: ProvenanceRowSchema.nullable(),
      usePolicy: UsePolicyRowSchema.nullable(),
    }),
  ),
});
export type MemoryRecallResponse = z.infer<typeof MemoryRecallResponseSchema>;

/** POST /api/memory/writeback response. */
export const WritebackResponseSchema = z.object({ thoughtId: z.string().min(1) });

/** POST /api/memory/review response. */
export const ReviewResponseSchema = z.object({
  reviewId: z.string().min(1),
  promoted: z.boolean(),
});
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;

/** 422 error body from POST /api/memory/review when promotion gate is violated. */
export const ReviewRequiresReviewErrorSchema = z.object({
  error: z.literal("REQUIRES_REVIEW"),
});

/** Re-export the review-status enum so callers don't need a second import. */
export { MemoryReviewStatus };

/* --------------------------------------------------------------------------
 * Phase C entity wire schemas
 * ------------------------------------------------------------------------ */

export const ConvexEntityRowSchema = z.object({
  _id: z.string().min(1),
  _creationTime: z.number().optional(),
  userId: z.string().min(1),
  kind: z.string().min(1),
  canonicalName: z.string().min(1),
  aliases: z.array(z.string()),
  metadata: z.unknown(),
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
});
export type ConvexEntityRow = z.infer<typeof ConvexEntityRowSchema>;

export const ConvexEntityMentionRowSchema = z.object({
  _id: z.string().min(1),
  _creationTime: z.number().optional(),
  userId: z.string().min(1),
  entityId: z.string().min(1),
  thoughtId: z.string().min(1),
  span: z.object({ start: z.number(), end: z.number() }).optional(),
  createdAt: z.number().positive(),
});
export type ConvexEntityMentionRow = z.infer<typeof ConvexEntityMentionRowSchema>;

export const ConvexEntityRelationRowSchema = z.object({
  _id: z.string().min(1),
  _creationTime: z.number().optional(),
  userId: z.string().min(1),
  fromEntityId: z.string().min(1),
  toEntityId: z.string().min(1),
  kind: z.string().min(1),
  evidenceThoughtIds: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
});
export type ConvexEntityRelationRow = z.infer<typeof ConvexEntityRelationRowSchema>;

export const EntityListResponseSchema = z.object({
  rows: z.array(ConvexEntityRowSchema),
});

export const EntityGetResponseSchema = z.object({
  entity: ConvexEntityRowSchema.nullable(),
  mentions: z.array(ConvexEntityMentionRowSchema),
});

export const EntityRelationsResponseSchema = z.object({
  outgoing: z.array(ConvexEntityRelationRowSchema),
  incoming: z.array(ConvexEntityRelationRowSchema),
});

/* --------------------------------------------------------------------------
 * Project (scope namespace) wire schemas
 * ------------------------------------------------------------------------ */

export const ConvexProjectRowSchema = z.object({
  _id: z.string().min(1),
  _creationTime: z.number().optional(),
  userId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.number().positive(),
});
export type ConvexProjectRow = z.infer<typeof ConvexProjectRowSchema>;

export const ProjectListResponseSchema = z.object({
  rows: z.array(ConvexProjectRowSchema),
});

export const ProjectCreateResponseSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
});
