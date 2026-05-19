import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel.js";
import { internalMutation, mutation, query } from "../_generated/server.js";
import { writeAudit } from "../_lib/audit.js";
import { requireUserId } from "../_lib/identity.js";

async function assertOwnedThought(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  thoughtId: Id<"thoughts">,
  userId: string,
): Promise<void> {
  const row = await ctx.db.get(thoughtId);
  if (row === null || row.userId !== userId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
  }
}

const statusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("confirmed"),
  v.literal("rejected"),
  v.literal("needs_revision"),
);

export const submit = mutation({
  args: {
    thoughtId: v.id("thoughts"),
    status: statusValidator,
    reviewer: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    const now = Date.now();
    const row: {
      thoughtId: Id<"thoughts">;
      userId: string;
      status: typeof args.status;
      reviewer: string;
      reviewedAt: number;
      note?: string;
    } = {
      thoughtId: args.thoughtId,
      userId,
      status: args.status,
      reviewer: args.reviewer,
      reviewedAt: now,
    };
    if (args.note !== undefined) {
      row.note = args.note;
    }
    const id = await ctx.db.insert("memory_review", row);
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId,
      action: "review.submit",
      actor: userId,
      diff: { status: args.status, reviewer: args.reviewer },
    });
    return id;
  },
});

export const list = query({
  args: { thoughtId: v.id("thoughts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    return await ctx.db
      .query("memory_review")
      .withIndex("by_thought", (q) => q.eq("thoughtId", args.thoughtId))
      .collect();
  },
});

/**
 * Inspector page query: returns the caller's review history, newest first.
 * No native (userId, reviewedAt) index — the `by_user` index scopes to the
 * tenant; we sort + slice in JS. Acceptable while review counts stay small
 * (per-user history, not a feed). If review volume grows, add a dedicated
 * `by_user_reviewed_at` index.
 */
export const listForUser = query({
  args: {
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 50;
    const rows = await ctx.db
      .query("memory_review")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const filtered =
      args.status === undefined ? rows : rows.filter((r) => r.status === args.status);
    // `_creationTime` is monotonic per insertion; `reviewedAt` can tie when two
    // reviews land in the same millisecond. Sort by creation time for a stable
    // "newest first" order.
    filtered.sort((a, b) => b._creationTime - a._creationTime);
    return filtered.slice(0, limit);
  },
});

/**
 * Promotes a memory_use_policy entry to trustGrade="instruction". Only valid
 * when memory_review has a "confirmed" row for the thought — see CLAUDE.md §7.
 */
export const promote = mutation({
  args: { thoughtId: v.id("thoughts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    const reviews = await ctx.db
      .query("memory_review")
      .withIndex("by_thought", (q) => q.eq("thoughtId", args.thoughtId))
      .collect();
    const hasConfirmed = reviews.some((r) => r.userId === userId && r.status === "confirmed");
    if (!hasConfirmed) {
      throw new ConvexError({
        code: "REQUIRES_REVIEW",
        message: "Promotion requires a confirmed review",
      });
    }
    const policy = await ctx.db
      .query("memory_use_policy")
      .withIndex("by_thought", (q) => q.eq("thoughtId", args.thoughtId))
      .unique();
    if (policy === null || policy.userId !== userId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Use policy not found",
      });
    }
    await ctx.db.patch(policy._id, { trustGrade: "instruction" });
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId,
      action: "review.promote",
      actor: userId,
      diff: { trustGrade: "instruction" },
    });
  },
});

/**
 * Submit a review and (optionally) promote to instruction in one mutation —
 * the atomic version used by `POST /api/memory/review`. The HTTP layer can't
 * span two mutations transactionally, so the pair lives here.
 *
 * Gate: `promoteTo === "instruction"` requires `status === "confirmed"`;
 * otherwise we throw REQUIRES_REVIEW so the HTTP caller can surface it.
 */
export const submitAndPromoteInternal = internalMutation({
  args: {
    userId: v.string(),
    thoughtId: v.id("thoughts"),
    status: statusValidator,
    note: v.optional(v.string()),
    promoteTo: v.optional(v.literal("instruction")),
  },
  handler: async (ctx, args) => {
    const owning = await ctx.db.get(args.thoughtId);
    if (owning === null || owning.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    if (args.promoteTo !== undefined && args.status !== "confirmed") {
      throw new ConvexError({
        code: "REQUIRES_REVIEW",
        message: "Promotion requires a confirmed review",
      });
    }
    const now = Date.now();
    const row: {
      thoughtId: Id<"thoughts">;
      userId: string;
      status: typeof args.status;
      reviewer: string;
      reviewedAt: number;
      note?: string;
    } = {
      thoughtId: args.thoughtId,
      userId: args.userId,
      status: args.status,
      // The reviewer is always the authenticated user; the Worker passes that
      // userId through. No separate reviewer field needed at the HTTP layer.
      reviewer: args.userId,
      reviewedAt: now,
    };
    if (args.note !== undefined) {
      row.note = args.note;
    }
    const reviewId = await ctx.db.insert("memory_review", row);
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId: args.userId,
      action: "review.submit",
      actor: args.userId,
      diff: { status: args.status, reviewer: args.userId },
    });

    if (args.promoteTo !== "instruction" || args.status !== "confirmed") {
      return { reviewId, promoted: false };
    }

    const policy = await ctx.db
      .query("memory_use_policy")
      .withIndex("by_thought", (q) => q.eq("thoughtId", args.thoughtId))
      .unique();
    if (policy === null || policy.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Use policy not found" });
    }
    await ctx.db.patch(policy._id, { trustGrade: "instruction" });
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId: args.userId,
      action: "review.promote",
      actor: args.userId,
      diff: { trustGrade: "instruction" },
    });
    return { reviewId, promoted: true };
  },
});

export const submitInternal = internalMutation({
  args: {
    userId: v.string(),
    thoughtId: v.id("thoughts"),
    status: statusValidator,
    reviewer: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Internal callers (the MCP Worker) supply userId from the OAuth context.
    // Still defend against id-mismatch in case of bugs.
    const owning = await ctx.db.get(args.thoughtId);
    if (owning === null || owning.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    const now = Date.now();
    const row: {
      thoughtId: Id<"thoughts">;
      userId: string;
      status: typeof args.status;
      reviewer: string;
      reviewedAt: number;
      note?: string;
    } = {
      thoughtId: args.thoughtId,
      userId: args.userId,
      status: args.status,
      reviewer: args.reviewer,
      reviewedAt: now,
    };
    if (args.note !== undefined) {
      row.note = args.note;
    }
    const id = await ctx.db.insert("memory_review", row);
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId: args.userId,
      action: "review.submit",
      actor: args.userId,
      diff: { status: args.status, reviewer: args.reviewer },
    });
    return id;
  },
});
