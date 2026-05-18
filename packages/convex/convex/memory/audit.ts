import { v } from "convex/values";
import { query } from "../_generated/server.js";
import { requireUserId } from "../_lib/identity.js";

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("memory_audit")
      .withIndex("by_user_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});
