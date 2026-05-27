import { orgEntityMetadataSchema, personEntityMetadataSchema } from "@openbrains/shared";
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

/**
 * Phase F: update CRM-shaped metadata on a person/org entity. The Convex
 * validator keeps the field as `v.any()` (per the CLAUDE.md pattern); the
 * Zod schemas in `@openbrains/shared` enforce the real shape here at the
 * boundary. Cross-kind writes are rejected so a person entity can't be
 * patched with org fields by accident.
 */
export const updateEntityMetadata = mutation({
  args: { entityId: v.id("entities"), metadata: v.any() },
  handler: async (ctx, args): Promise<void> => {
    const userId = await requireUserId(ctx);
    const entity = await assertOwnedEntity(ctx, args.entityId, userId);
    const validated = validateEntityMetadata(entity.kind, args.metadata);
    await ctx.db.patch(args.entityId, {
      metadata: validated,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId,
      action: "entity.updateMetadata",
      actor: userId,
      diff: { entityId: args.entityId, kind: entity.kind },
    });
  },
});

function validateEntityMetadata(kind: string, raw: unknown): unknown {
  if (kind === "person") {
    const parsed = personEntityMetadataSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ConvexError({
        code: "INVALID",
        message: `Invalid person metadata: ${parsed.error.message}`,
      });
    }
    return parsed.data;
  }
  if (kind === "org") {
    const parsed = orgEntityMetadataSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ConvexError({
        code: "INVALID",
        message: `Invalid org metadata: ${parsed.error.message}`,
      });
    }
    return parsed.data;
  }
  throw new ConvexError({
    code: "INVALID",
    message: `Entity kind '${kind}' does not accept structured metadata`,
  });
}

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
