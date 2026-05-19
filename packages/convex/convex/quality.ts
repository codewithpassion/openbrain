import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { query } from "./_generated/server.js";
import { requireUserId } from "./_lib/identity.js";

interface QualityFlag {
  readonly thoughtId: string;
  readonly reason: string;
  readonly content: string;
  readonly createdAt: number;
}

interface QualityReport {
  readonly totalThoughts: number;
  readonly flagged: readonly QualityFlag[];
  readonly counts: {
    readonly missingType: number;
    readonly emptyTopics: number;
    readonly noProvenance: number;
    readonly noEntities: number;
  };
}

/**
 * Quality audit: identifies thoughts that the LLM-driven enrichment pipeline
 * has not yet covered. The dashboard surfaces these so the user can either
 * trigger re-enrichment or fix manually. Pure read-only.
 */
export const reportForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<QualityReport> => {
    const userId = await requireUserId(ctx);
    const cap = args.limit ?? 50;
    const thoughts = await ctx.db
      .query("thoughts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(500);

    const flagged: QualityFlag[] = [];
    let missingType = 0;
    let emptyTopics = 0;
    let noProvenance = 0;
    let noEntities = 0;

    for (const t of thoughts) {
      const reasons: string[] = [];
      if (t.metadata.type === undefined) {
        missingType += 1;
        reasons.push("missing type");
      }
      if (t.metadata.topics.length === 0) {
        emptyTopics += 1;
        reasons.push("no topics");
      }
      const prov = await ctx.db
        .query("memory_provenance")
        .withIndex("by_thought", (q) => q.eq("thoughtId", t._id))
        .first();
      if (prov === null) {
        noProvenance += 1;
        reasons.push("no provenance");
      }
      const mention = await ctx.db
        .query("entity_mentions")
        .withIndex("by_user_thought", (q) => q.eq("userId", userId).eq("thoughtId", t._id))
        .first();
      if (mention === null) {
        noEntities += 1;
        reasons.push("no entities");
      }
      if (reasons.length > 0 && flagged.length < cap) {
        flagged.push({
          thoughtId: t._id,
          reason: reasons.join(", "),
          content: truncateForFlag(t),
          createdAt: t.createdAt,
        });
      }
    }

    return {
      totalThoughts: thoughts.length,
      flagged,
      counts: { missingType, emptyTopics, noProvenance, noEntities },
    };
  },
});

function truncateForFlag(t: Doc<"thoughts">): string {
  return t.content.length > 140 ? `${t.content.slice(0, 140)}…` : t.content;
}
