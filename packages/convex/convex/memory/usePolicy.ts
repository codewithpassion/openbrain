import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel.js";
import { mutation, query } from "../_generated/server.js";
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

/**
 * Upsert a use-policy for a thought. Per CLAUDE.md §7, this path always
 * writes trustGrade="evidence". The only way to set "instruction" is the
 * `memory/review.promote` mutation, which gates on a confirmed review.
 */
export const upsert = mutation({
  args: {
    thoughtId: v.id("thoughts"),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    const existing = await ctx.db
      .query("memory_use_policy")
      .withIndex("by_thought", (q) => q.eq("thoughtId", args.thoughtId))
      .unique();
    if (existing === null) {
      const row: {
        thoughtId: Id<"thoughts">;
        userId: string;
        trustGrade: "evidence";
        scopes: string[];
        expiresAt?: number;
      } = {
        thoughtId: args.thoughtId,
        userId,
        trustGrade: "evidence",
        scopes: args.scopes,
      };
      if (args.expiresAt !== undefined) {
        row.expiresAt = args.expiresAt;
      }
      await ctx.db.insert("memory_use_policy", row);
    } else {
      const patch: { scopes: string[]; expiresAt?: number } = { scopes: args.scopes };
      if (args.expiresAt !== undefined) {
        patch.expiresAt = args.expiresAt;
      }
      await ctx.db.patch(existing._id, patch);
    }
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId,
      action: "usePolicy.upsert",
      actor: userId,
      diff: { scopes: args.scopes, expiresAt: args.expiresAt ?? null },
    });
  },
});

export const get = query({
  args: { thoughtId: v.id("thoughts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    return await ctx.db
      .query("memory_use_policy")
      .withIndex("by_thought", (q) => q.eq("thoughtId", args.thoughtId))
      .unique();
  },
});
