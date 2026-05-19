import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { internalMutation, internalQuery, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";

/**
 * Compute the YYYY-MM-DD label (UTC) for a digest covering the 24h ending at
 * `endMs`. Pure helper — exported for tests so date math doesn't drift between
 * the cron and the verifier.
 */
export function digestDateLabel(endMs: number): string {
  const d = new Date(endMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const listForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 30;
    return await ctx.db
      .query("digests")
      .withIndex("by_user_generated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const getLatestForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("digests")
      .withIndex("by_user_generated", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

const summaryArgs = v.object({
  userId: v.string(),
  date: v.string(),
  summary: v.string(),
  thoughtIds: v.array(v.id("thoughts")),
  thoughtCount: v.number(),
  generator: v.string(),
});

/**
 * Internal mutation called by the digest action after the summarizer returns.
 * Idempotent on (userId, date) — calling twice for the same window patches the
 * existing row rather than creating a duplicate.
 */
export const recordInternal = internalMutation({
  args: { summary: summaryArgs },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("digests")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.summary.userId).eq("date", args.summary.date),
      )
      .unique();
    const now = Date.now();
    const row: {
      userId: string;
      date: string;
      summary: string;
      thoughtIds: Id<"thoughts">[];
      thoughtCount: number;
      generator: string;
      generatedAt: number;
    } = {
      userId: args.summary.userId,
      date: args.summary.date,
      summary: args.summary.summary,
      thoughtIds: args.summary.thoughtIds,
      thoughtCount: args.summary.thoughtCount,
      generator: args.summary.generator,
      generatedAt: now,
    };
    let id: Id<"digests">;
    if (existing === null) {
      id = await ctx.db.insert("digests", row);
    } else {
      id = existing._id;
      await ctx.db.patch(id, {
        summary: row.summary,
        thoughtIds: row.thoughtIds,
        thoughtCount: row.thoughtCount,
        generator: row.generator,
        generatedAt: row.generatedAt,
      });
    }
    await writeAudit(ctx, {
      userId: args.summary.userId,
      action: existing === null ? "digest.create" : "digest.regenerate",
      actor: "system",
      diff: { date: args.summary.date, thoughtCount: args.summary.thoughtCount },
    });
    return id;
  },
});

/**
 * Hydrate the thoughts feeding a digest for a (userId, windowStartMs..endMs)
 * window. Called by the action's `runQuery`; declared here so the same code
 * path runs in tests.
 */
export const collectWindowInternal = internalQuery({
  args: {
    userId: v.string(),
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    cap: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    thoughts: Pick<Doc<"thoughts">, "_id" | "content" | "metadata" | "createdAt">[];
  }> => {
    if (args.windowStartMs > args.windowEndMs) {
      throw new ConvexError({ code: "INVALID", message: "windowStartMs > windowEndMs" });
    }
    const cap = args.cap ?? 200;
    const rows = await ctx.db
      .query("thoughts")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(cap);
    const filtered = rows.filter(
      (r) => r.createdAt >= args.windowStartMs && r.createdAt <= args.windowEndMs,
    );
    return {
      thoughts: filtered.map((r) => ({
        _id: r._id,
        content: r.content,
        metadata: r.metadata,
        createdAt: r.createdAt,
      })),
    };
  },
});
