import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server.js";
import { requireUserId } from "./_lib/identity.js";
import { recordJobRun } from "./_lib/jobs.js";

export const listForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 50;
    // Show both this-user-specific runs *and* global (no-user) job runs.
    const userScoped = await ctx.db
      .query("job_runs")
      .withIndex("by_user_started", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    const global = await ctx.db
      .query("job_runs")
      .withIndex("by_user_started", (q) => q.eq("userId", undefined))
      .order("desc")
      .take(limit);
    const combined = [...userScoped, ...global].sort((a, b) => b.startedAt - a.startedAt);
    return combined.slice(0, limit);
  },
});

const statusValidator = v.union(v.literal("success"), v.literal("failure"), v.literal("skipped"));

export const recordRunInternal = internalMutation({
  args: {
    name: v.string(),
    userId: v.optional(v.string()),
    status: statusValidator,
    startedAt: v.number(),
    finishedAt: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry: Parameters<typeof recordJobRun>[1] = {
      name: args.name,
      status: args.status,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
    };
    if (args.userId !== undefined) {
      entry.userId = args.userId;
    }
    if (args.note !== undefined) {
      entry.note = args.note;
    }
    await recordJobRun(ctx, entry);
  },
});
