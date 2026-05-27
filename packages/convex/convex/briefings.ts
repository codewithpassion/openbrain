import type { GenericMutationCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel.js";
import { internalMutation, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";

export const listForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 30;
    return await ctx.db
      .query("briefings")
      .withIndex("by_user_generated_briefings", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const latestForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("briefings")
      .withIndex("by_user_generated_briefings", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

const sectionsValidator = v.object({
  recent: v.array(v.string()),
  followUps: v.array(v.string()),
  openQuestions: v.array(v.string()),
});

export const recordInternal = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    summary: v.string(),
    sections: sectionsValidator,
    thoughtIds: v.array(v.id("thoughts")),
    generator: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"briefings">> => {
    const existing = await ctx.db
      .query("briefings")
      .withIndex("by_user_date_briefings", (q) => q.eq("userId", args.userId).eq("date", args.date))
      .unique();
    const now = Date.now();
    const row: {
      userId: string;
      date: string;
      summary: string;
      sections: typeof args.sections;
      thoughtIds: Id<"thoughts">[];
      generator: string;
      generatedAt: number;
    } = {
      userId: args.userId,
      date: args.date,
      summary: args.summary,
      sections: args.sections,
      thoughtIds: args.thoughtIds,
      generator: args.generator,
      generatedAt: now,
    };
    let id: Id<"briefings">;
    if (existing === null) {
      id = await ctx.db.insert("briefings", row);
    } else {
      id = existing._id;
      await ctx.db.patch(id, {
        summary: row.summary,
        sections: row.sections,
        thoughtIds: row.thoughtIds,
        generator: row.generator,
        generatedAt: row.generatedAt,
      });
    }
    await upsertBriefingThought(ctx, args.userId, args.date, args.summary, args.sections);
    await writeAudit(ctx, {
      userId: args.userId,
      action: existing === null ? "briefing.create" : "briefing.regenerate",
      actor: "system",
      diff: { date: args.date, sections: Object.keys(args.sections).length },
    });
    return id;
  },
});

/**
 * Phase G: emit the briefing as a `thoughts` row so it shows up in the same
 * recall surface as everything else. Idempotent on `(userId, date)` via a
 * derived fingerprint — re-running for the same date patches in place.
 */
async function upsertBriefingThought(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  date: string,
  summary: string,
  sections: {
    recent: readonly string[];
    followUps: readonly string[];
    openQuestions: readonly string[];
  },
): Promise<void> {
  const fingerprint = `briefing:${userId}:${date}`.padEnd(64, "0").slice(0, 64);
  const content = renderBriefingContent(summary, sections);
  const existing = await ctx.db
    .query("thoughts")
    .withIndex("by_user_fingerprint", (q) => q.eq("userId", userId).eq("fingerprint", fingerprint))
    .unique();
  const now = Date.now();
  const metadata = {
    type: "briefing",
    topics: ["briefing"],
    people: [],
    action_items: [...sections.followUps],
    dates_mentioned: [date],
  };
  let thoughtId: Id<"thoughts">;
  if (existing === null) {
    thoughtId = await ctx.db.insert("thoughts", {
      userId,
      content,
      source: "life-engine:briefing",
      embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
      embeddingDims: 1024,
      fingerprint,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    thoughtId = existing._id;
    await ctx.db.patch(thoughtId, { content, updatedAt: now, metadata });
  }
  // Briefings are agent-generated; CLAUDE.md §7 mandates evidence-grade by
  // default. Sidecars are inserted only when missing — re-running for the same
  // date doesn't duplicate them.
  const provenance = await ctx.db
    .query("memory_provenance")
    .withIndex("by_thought", (q) => q.eq("thoughtId", thoughtId))
    .unique();
  if (provenance === null) {
    await ctx.db.insert("memory_provenance", {
      thoughtId,
      userId,
      origin: "agent_generated",
      agent: "life-engine",
      capturedAt: now,
    });
  }
  const policy = await ctx.db
    .query("memory_use_policy")
    .withIndex("by_thought", (q) => q.eq("thoughtId", thoughtId))
    .unique();
  if (policy === null) {
    await ctx.db.insert("memory_use_policy", {
      thoughtId,
      userId,
      trustGrade: "evidence",
      scopes: ["personal"],
    });
  }
}

function renderBriefingContent(
  summary: string,
  sections: {
    recent: readonly string[];
    followUps: readonly string[];
    openQuestions: readonly string[];
  },
): string {
  const parts: string[] = [summary.trim()];
  if (sections.recent.length > 0) {
    parts.push(`Recent:\n${sections.recent.map((s) => `- ${s}`).join("\n")}`);
  }
  if (sections.followUps.length > 0) {
    parts.push(`Follow-ups:\n${sections.followUps.map((s) => `- ${s}`).join("\n")}`);
  }
  if (sections.openQuestions.length > 0) {
    parts.push(`Open questions:\n${sections.openQuestions.map((s) => `- ${s}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

/**
 * Fetch the user's "world model" thought, if one exists. Convention: a thought
 * with `metadata.type === "world_model"` and a `memory_use_policy` row at
 * `trustGrade: "instruction"`. The life-engine action uses this as binding
 * context.
 */
export const worldModelForInternal = internalMutation({
  // Mutation so the action calls it as part of the same round-trip; in
  // practice no writes happen.
  args: { userId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<Pick<Doc<"thoughts">, "_id" | "content" | "metadata"> | null> => {
    const thoughts = await ctx.db
      .query("thoughts")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
    for (const t of thoughts) {
      if (t.metadata.type !== "world_model") {
        continue;
      }
      const policy = await ctx.db
        .query("memory_use_policy")
        .withIndex("by_thought", (q) => q.eq("thoughtId", t._id))
        .unique();
      if (policy !== null && policy.trustGrade === "instruction") {
        return { _id: t._id, content: t.content, metadata: t.metadata };
      }
    }
    return null;
  },
});

export const seedWorldModel = internalMutation({
  args: { userId: v.string(), content: v.string() },
  handler: async (ctx, args): Promise<Id<"thoughts">> => {
    if (args.content.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "Content cannot be empty" });
    }
    const now = Date.now();
    return await ctx.db.insert("thoughts", {
      userId: args.userId,
      content: args.content,
      source: "life-engine:world-model",
      embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
      embeddingDims: 1024,
      fingerprint: `wm-${args.userId}-${now}`.padEnd(64, "0").slice(0, 64),
      metadata: {
        type: "world_model",
        topics: ["world-model"],
        people: [],
        action_items: [],
        dates_mentioned: [],
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});
