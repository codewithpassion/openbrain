import { v } from "convex/values";
import type { Id } from "../_generated/dataModel.js";
import { internalMutation } from "../_generated/server.js";
import { writeAudit } from "../_lib/audit.js";

const metadataValidator = v.object({
  type: v.optional(v.string()),
  topics: v.array(v.string()),
  people: v.array(v.string()),
  action_items: v.array(v.string()),
  dates_mentioned: v.array(v.string()),
});

const provenanceValidator = v.object({
  origin: v.union(v.literal("agent_inferred"), v.literal("agent_generated")),
  agent: v.optional(v.string()),
  agentVersion: v.optional(v.string()),
  sessionId: v.optional(v.string()),
});

/**
 * Writeback for agent-inferred/generated memory. CLAUDE.md §7 mandates that
 * memory written through this path is always graded `evidence` — there is
 * intentionally NO `trustGrade` argument on this validator. Promotion to
 * `instruction` flows exclusively through `memory/review.promote`.
 *
 * Atomic: thought + provenance + use_policy in a single Convex mutation.
 * If any step fails the entire transaction rolls back.
 */
export const writebackInternal = internalMutation({
  args: {
    userId: v.string(),
    content: v.string(),
    source: v.string(),
    embeddingModel: v.string(),
    embeddingDims: v.number(),
    fingerprint: v.string(),
    metadata: metadataValidator,
    provenance: provenanceValidator,
    scopes: v.optional(v.array(v.string())),
    vectorizeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const thoughtRow: {
      userId: string;
      content: string;
      source: string;
      embeddingModel: string;
      embeddingDims: number;
      fingerprint: string;
      metadata: typeof args.metadata;
      createdAt: number;
      updatedAt: number;
      vectorizeId?: string;
    } = {
      userId: args.userId,
      content: args.content,
      source: args.source,
      embeddingModel: args.embeddingModel,
      embeddingDims: args.embeddingDims,
      fingerprint: args.fingerprint,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    };
    if (args.vectorizeId !== undefined) {
      thoughtRow.vectorizeId = args.vectorizeId;
    }
    const thoughtId = await ctx.db.insert("thoughts", thoughtRow);
    await writeAudit(ctx, {
      thoughtId,
      userId: args.userId,
      action: "thought.create",
      actor: args.userId,
      diff: { content: args.content, source: args.source },
    });

    const provRow: {
      thoughtId: Id<"thoughts">;
      userId: string;
      origin: typeof args.provenance.origin;
      capturedAt: number;
      agent?: string;
      agentVersion?: string;
      sessionId?: string;
    } = {
      thoughtId,
      userId: args.userId,
      origin: args.provenance.origin,
      capturedAt: now,
    };
    if (args.provenance.agent !== undefined) {
      provRow.agent = args.provenance.agent;
    }
    if (args.provenance.agentVersion !== undefined) {
      provRow.agentVersion = args.provenance.agentVersion;
    }
    if (args.provenance.sessionId !== undefined) {
      provRow.sessionId = args.provenance.sessionId;
    }
    await ctx.db.insert("memory_provenance", provRow);
    await writeAudit(ctx, {
      thoughtId,
      userId: args.userId,
      action: "provenance.record",
      actor: args.userId,
      diff: { origin: args.provenance.origin },
    });

    await ctx.db.insert("memory_use_policy", {
      thoughtId,
      userId: args.userId,
      trustGrade: "evidence", // hard-wired — see CLAUDE.md §7
      scopes: args.scopes ?? [],
    });
    await writeAudit(ctx, {
      thoughtId,
      userId: args.userId,
      action: "usePolicy.upsert",
      actor: args.userId,
      diff: { trustGrade: "evidence", scopes: args.scopes ?? [] },
    });

    return { thoughtId };
  },
});
