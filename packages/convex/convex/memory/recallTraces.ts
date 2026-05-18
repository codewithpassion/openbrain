import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel.js";
import { mutation, query } from "../_generated/server.js";
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

export const record = mutation({
  args: {
    thoughtId: v.id("thoughts"),
    query: v.string(),
    score: v.number(),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    return await ctx.db.insert("memory_recall_traces", {
      thoughtId: args.thoughtId,
      userId,
      query: args.query,
      score: args.score,
      clientId: args.clientId,
      at: Date.now(),
    });
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("memory_recall_traces")
      .withIndex("by_user_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});
