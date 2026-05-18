import type { GenericMutationCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel.js";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";

const metadataValidator = v.object({
  type: v.optional(v.string()),
  topics: v.array(v.string()),
  people: v.array(v.string()),
  action_items: v.array(v.string()),
  dates_mentioned: v.array(v.string()),
});

export const createThought = mutation({
  args: {
    content: v.string(),
    source: v.string(),
    embeddingModel: v.string(),
    embeddingDims: v.number(),
    fingerprint: v.string(),
    metadata: metadataValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("thoughts", {
      userId,
      content: args.content,
      source: args.source,
      embeddingModel: args.embeddingModel,
      embeddingDims: args.embeddingDims,
      fingerprint: args.fingerprint,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      thoughtId: id,
      userId,
      action: "thought.create",
      actor: userId,
      diff: { content: args.content, source: args.source },
    });
    return id;
  },
});

export const getThought = query({
  args: { id: v.id("thoughts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null) {
      return null;
    }
    if (row.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    return row;
  },
});

export const listThoughts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("thoughts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const getByFingerprint = query({
  args: { fingerprint: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("thoughts")
      .withIndex("by_user_fingerprint", (q) =>
        q.eq("userId", userId).eq("fingerprint", args.fingerprint),
      )
      .unique();
  },
});

export const deleteThought = mutation({
  args: { id: v.id("thoughts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null || row.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      thoughtId: args.id,
      userId,
      action: "thought.delete",
      actor: userId,
      diff: { deleted: true },
    });
  },
});

export const attachVectorizeId = mutation({
  args: { id: v.id("thoughts"), vectorizeId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null || row.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    await ctx.db.patch(args.id, { vectorizeId: args.vectorizeId, updatedAt: Date.now() });
    await writeAudit(ctx, {
      thoughtId: args.id,
      userId,
      action: "thought.attachVectorizeId",
      actor: userId,
      diff: { vectorizeId: args.vectorizeId },
    });
  },
});

// ---------------------------------------------------------------------------
// Internal variants used by HTTP actions. These take an explicit `userId`
// (resolved by the MCP Worker from the OAuth token) and skip the
// `requireUserId` step. They MUST NOT be exposed outside the trust boundary.
// ---------------------------------------------------------------------------

async function createThoughtCore(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  args: {
    content: string;
    source: string;
    embeddingModel: string;
    embeddingDims: number;
    fingerprint: string;
    metadata: Doc<"thoughts">["metadata"];
  },
): Promise<Id<"thoughts">> {
  const now = Date.now();
  const id = await ctx.db.insert("thoughts", {
    userId,
    content: args.content,
    source: args.source,
    embeddingModel: args.embeddingModel,
    embeddingDims: args.embeddingDims,
    fingerprint: args.fingerprint,
    metadata: args.metadata,
    createdAt: now,
    updatedAt: now,
  });
  await writeAudit(ctx, {
    thoughtId: id,
    userId,
    action: "thought.create",
    actor: userId,
    diff: { content: args.content, source: args.source },
  });
  return id;
}

const metadataInternalValidator = v.object({
  type: v.optional(v.string()),
  topics: v.array(v.string()),
  people: v.array(v.string()),
  action_items: v.array(v.string()),
  dates_mentioned: v.array(v.string()),
});

export const createThoughtInternal = internalMutation({
  args: {
    userId: v.string(),
    content: v.string(),
    source: v.string(),
    embeddingModel: v.string(),
    embeddingDims: v.number(),
    fingerprint: v.string(),
    metadata: metadataInternalValidator,
  },
  handler: async (ctx, args) =>
    createThoughtCore(ctx, args.userId, {
      content: args.content,
      source: args.source,
      embeddingModel: args.embeddingModel,
      embeddingDims: args.embeddingDims,
      fingerprint: args.fingerprint,
      metadata: args.metadata,
    }),
});

export const listThoughtsInternal = internalQuery({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
    topic: v.optional(v.string()),
    person: v.optional(v.string()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    // We index by (userId, createdAt) so the userId scope is pushed down.
    // `type` is filtered at the index layer via `q.filter`. `topic` and
    // `person` are JSON-array fields — Convex's `q.filter` lacks a native
    // array-contains, so those filters run in JS on the index-scoped result.
    // Cost: O(rows-for-user) when topic/person filters are used; acceptable
    // for v1. A dedicated denormalized index would be the v2 fix.
    let q = ctx.db
      .query("thoughts")
      .withIndex("by_user_created", (qq) => qq.eq("userId", args.userId))
      .order("desc");
    const typeFilter = args.type;
    if (typeFilter !== undefined) {
      q = q.filter((f) => f.eq(f.field("metadata.type"), typeFilter));
    }
    const cutoff = args.days === undefined ? undefined : Date.now() - args.days * 86400000;
    if (cutoff !== undefined) {
      q = q.filter((f) => f.gte(f.field("createdAt"), cutoff));
    }
    if (args.topic === undefined && args.person === undefined) {
      return await q.take(limit);
    }
    const out: Doc<"thoughts">[] = [];
    for await (const row of q) {
      if (args.topic !== undefined && !row.metadata.topics.includes(args.topic)) {
        continue;
      }
      if (args.person !== undefined && !row.metadata.people.includes(args.person)) {
        continue;
      }
      out.push(row);
      if (out.length >= limit) {
        break;
      }
    }
    return out;
  },
});

export const getByFingerprintInternal = internalQuery({
  args: { userId: v.string(), fingerprint: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("thoughts")
      .withIndex("by_user_fingerprint", (q) =>
        q.eq("userId", args.userId).eq("fingerprint", args.fingerprint),
      )
      .unique();
  },
});

export const getByIdsInternal = internalQuery({
  args: { userId: v.string(), ids: v.array(v.id("thoughts")) },
  handler: async (ctx, args) => {
    const rows: Doc<"thoughts">[] = [];
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (row !== null && row.userId === args.userId) {
        rows.push(row);
      }
    }
    return rows;
  },
});

export const statsInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("thoughts")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .collect();
    const byType = new Map<string, number>();
    const byTopic = new Map<string, number>();
    const byPerson = new Map<string, number>();
    for (const r of rows) {
      const t = r.metadata.type ?? "unknown";
      byType.set(t, (byType.get(t) ?? 0) + 1);
      for (const topic of r.metadata.topics) {
        byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
      }
      for (const person of r.metadata.people) {
        byPerson.set(person, (byPerson.get(person) ?? 0) + 1);
      }
    }
    return {
      total: rows.length,
      byType: Object.fromEntries(byType),
      topTopics: [...byTopic.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count })),
      topPeople: [...byPerson.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
    };
  },
});
