import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel.js";
import { internalMutation } from "../_generated/server.js";

/**
 * Hydrates the MCP Worker's vectorize hits with the full thought row + the
 * latest provenance row + the current use-policy. Cross-tenant ids are
 * silently dropped (no existence leak — see ARCHITECTURE.md §"Tenancy" and
 * CLAUDE.md §6).
 *
 * Writes one `memory_recall_traces` row per *kept* thought so the dashboard
 * can audit what queries surfaced what memory. Dropped (cross-tenant) ids
 * never produce a trace.
 *
 * Modeled as an `internalMutation` (not query) because the trace write must
 * be atomic with the join.
 */
export const recallInternal = internalMutation({
  args: {
    userId: v.string(),
    thoughtIds: v.array(v.id("thoughts")),
    query: v.string(),
    scores: v.array(v.number()),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const items: {
      thought: Doc<"thoughts">;
      provenance: Doc<"memory_provenance"> | null;
      usePolicy: Doc<"memory_use_policy"> | null;
    }[] = [];
    const now = Date.now();
    for (let i = 0; i < args.thoughtIds.length; i += 1) {
      const thoughtId = args.thoughtIds[i] as Id<"thoughts">;
      const thought = await ctx.db.get(thoughtId);
      if (thought === null || thought.userId !== args.userId) {
        continue;
      }
      const provRows = await ctx.db
        .query("memory_provenance")
        .withIndex("by_thought", (q) => q.eq("thoughtId", thoughtId))
        .collect();
      // Sort by capturedAt desc; tie-break on _creationTime so two writes in
      // the same millisecond still resolve to the most-recent insert.
      provRows.sort((a, b) => b.capturedAt - a.capturedAt || b._creationTime - a._creationTime);
      const provenance = provRows[0] ?? null;
      const usePolicy = await ctx.db
        .query("memory_use_policy")
        .withIndex("by_thought", (q) => q.eq("thoughtId", thoughtId))
        .unique();
      items.push({ thought, provenance, usePolicy });
      await ctx.db.insert("memory_recall_traces", {
        thoughtId,
        userId: args.userId,
        query: args.query,
        score: args.scores[i] ?? 0,
        clientId: args.clientId,
        at: now,
      });
    }
    return { items };
  },
});
