import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { internalMutation, query } from "./_generated/server.js";
import { requireUserId } from "./_lib/identity.js";

const statusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("success"),
  v.literal("failure"),
  v.literal("cancelled"),
);

const statsValidator = v.object({
  processed: v.number(),
  created: v.number(),
  skipped: v.number(),
  errors: v.number(),
});

export const listForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("imports")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const startInternal = internalMutation({
  args: {
    userId: v.string(),
    source: v.string(),
    direction: v.union(v.literal("import"), v.literal("export")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row: {
      userId: string;
      source: string;
      direction: "import" | "export";
      status: Doc<"imports">["status"];
      stats: { processed: number; created: number; skipped: number; errors: number };
      createdAt: number;
      updatedAt: number;
      note?: string;
    } = {
      userId: args.userId,
      source: args.source,
      direction: args.direction,
      status: "running",
      stats: { processed: 0, created: 0, skipped: 0, errors: 0 },
      createdAt: now,
      updatedAt: now,
    };
    if (args.note !== undefined) {
      row.note = args.note;
    }
    return await ctx.db.insert("imports", row);
  },
});

export const updateInternal = internalMutation({
  args: {
    id: v.id("imports"),
    userId: v.string(),
    status: statusValidator,
    stats: statsValidator,
    cursor: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null || row.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Import not found" });
    }
    const patch: {
      status: Doc<"imports">["status"];
      stats: typeof args.stats;
      updatedAt: number;
      cursor?: string;
      note?: string;
    } = {
      status: args.status,
      stats: args.stats,
      updatedAt: Date.now(),
    };
    if (args.cursor !== undefined) {
      patch.cursor = args.cursor;
    }
    if (args.note !== undefined) {
      patch.note = args.note;
    }
    await ctx.db.patch(args.id, patch);
  },
});
