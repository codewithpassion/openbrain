import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { internalMutation, mutation, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";

const interactionKindValidator = v.string();

async function assertOwnedEntity(
  ctx: Parameters<typeof requireUserId>[0],
  entityId: Id<"entities">,
  userId: string,
): Promise<Doc<"entities">> {
  const row = await ctx.db.get(entityId);
  if (row === null || row.userId !== userId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Entity not found" });
  }
  return row;
}

export const listPeople = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 200;
    return await ctx.db
      .query("entities")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", "person"))
      .order("desc")
      .take(limit);
  },
});

export const listOrgs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 200;
    return await ctx.db
      .query("entities")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", "org"))
      .order("desc")
      .take(limit);
  },
});

export const interactionsForEntity = query({
  args: { entityId: v.id("entities"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedEntity(ctx, args.entityId, userId);
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("interactions")
      .withIndex("by_user_entity_at", (q) => q.eq("userId", userId).eq("entityId", args.entityId))
      .order("desc")
      .take(limit);
  },
});

export const recordInteraction = mutation({
  args: {
    entityId: v.id("entities"),
    thoughtId: v.id("thoughts"),
    kind: interactionKindValidator,
    at: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedEntity(ctx, args.entityId, userId);
    const thought = await ctx.db.get(args.thoughtId);
    if (thought === null || thought.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    const row: {
      userId: string;
      entityId: Id<"entities">;
      thoughtId: Id<"thoughts">;
      kind: string;
      at: number;
      note?: string;
    } = {
      userId,
      entityId: args.entityId,
      thoughtId: args.thoughtId,
      kind: args.kind,
      at: args.at ?? Date.now(),
    };
    if (args.note !== undefined) {
      row.note = args.note;
    }
    const id = await ctx.db.insert("interactions", row);
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId,
      action: "crm.interaction",
      actor: userId,
      diff: { entityId: args.entityId, kind: args.kind },
    });
    return id;
  },
});

export const recordInteractionInternal = internalMutation({
  args: {
    userId: v.string(),
    entityId: v.id("entities"),
    thoughtId: v.id("thoughts"),
    kind: interactionKindValidator,
    at: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entity = await ctx.db.get(args.entityId);
    if (entity === null || entity.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Entity not found" });
    }
    const thought = await ctx.db.get(args.thoughtId);
    if (thought === null || thought.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    const row: {
      userId: string;
      entityId: Id<"entities">;
      thoughtId: Id<"thoughts">;
      kind: string;
      at: number;
      note?: string;
    } = {
      userId: args.userId,
      entityId: args.entityId,
      thoughtId: args.thoughtId,
      kind: args.kind,
      at: args.at ?? Date.now(),
    };
    if (args.note !== undefined) {
      row.note = args.note;
    }
    return await ctx.db.insert("interactions", row);
  },
});
