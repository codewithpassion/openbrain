import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { internalMutation, internalQuery, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";

const FAKE_AUDIT_ACTOR = "system";

export const listForUser = query({
  args: { kind: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 100;
    if (args.kind === undefined) {
      return await ctx.db
        .query("entities")
        .withIndex("by_user_updated", (q) => q.eq("userId", userId))
        .order("desc")
        .take(limit);
    }
    const filterKind = args.kind;
    return await ctx.db
      .query("entities")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", filterKind))
      .order("desc")
      .take(limit);
  },
});

export const getById = query({
  args: { id: v.id("entities") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null || row.userId !== userId) {
      return null;
    }
    return row;
  },
});

export const mentionsForEntity = query({
  args: { entityId: v.id("entities"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ent = await ctx.db.get(args.entityId);
    if (ent === null || ent.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Entity not found" });
    }
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("entity_mentions")
      .withIndex("by_user_entity", (q) => q.eq("userId", userId).eq("entityId", args.entityId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Returns all relations for the authenticated user across every entity. Used by
 * the dashboard's force-directed graph view (a single query is cheaper than
 * N relation lookups for N entities).
 */
export const relationsForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Doc<"entity_relations">[]> => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 500;
    // by_user_from is keyed on (userId, fromEntityId); ordering by index gives
    // a deterministic page without a separate by_user_updated index.
    return await ctx.db
      .query("entity_relations")
      .withIndex("by_user_from", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const relationsForEntity = query({
  args: { entityId: v.id("entities"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ent = await ctx.db.get(args.entityId);
    if (ent === null || ent.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Entity not found" });
    }
    const limit = args.limit ?? 100;
    const outgoing = await ctx.db
      .query("entity_relations")
      .withIndex("by_user_from", (q) => q.eq("userId", userId).eq("fromEntityId", args.entityId))
      .order("desc")
      .take(limit);
    const incoming = await ctx.db
      .query("entity_relations")
      .withIndex("by_user_to", (q) => q.eq("userId", userId).eq("toEntityId", args.entityId))
      .order("desc")
      .take(limit);
    return { outgoing, incoming };
  },
});

/* --------------------------------------------------------------------------
 * Internal queries used by the MCP Worker via http.ts. They accept `userId` as
 * a parameter and trust the caller (http.ts validates INTERNAL_API_SECRET).
 * --------------------------------------------------------------------------*/

export const listInternal = internalQuery({
  args: {
    userId: v.string(),
    kind: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"entities">[]> => {
    const limit = args.limit ?? 100;
    if (args.kind === undefined) {
      return await ctx.db
        .query("entities")
        .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(limit);
    }
    const filterKind = args.kind;
    return await ctx.db
      .query("entities")
      .withIndex("by_user_kind", (q) => q.eq("userId", args.userId).eq("kind", filterKind))
      .order("desc")
      .take(limit);
  },
});

export const getByIdInternal = internalQuery({
  args: {
    userId: v.string(),
    entityId: v.id("entities"),
    mentionsLimit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ entity: Doc<"entities"> | null; mentions: Doc<"entity_mentions">[] }> => {
    const entity = await ctx.db.get(args.entityId);
    if (entity === null || entity.userId !== args.userId) {
      return { entity: null, mentions: [] };
    }
    const limit = args.mentionsLimit ?? 50;
    const mentions = await ctx.db
      .query("entity_mentions")
      .withIndex("by_user_entity", (q) => q.eq("userId", args.userId).eq("entityId", args.entityId))
      .order("desc")
      .take(limit);
    return { entity, mentions };
  },
});

export const relationsInternal = internalQuery({
  args: {
    userId: v.string(),
    entityId: v.id("entities"),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ outgoing: Doc<"entity_relations">[]; incoming: Doc<"entity_relations">[] }> => {
    const entity = await ctx.db.get(args.entityId);
    if (entity === null || entity.userId !== args.userId) {
      return { outgoing: [], incoming: [] };
    }
    const limit = args.limit ?? 100;
    const outgoing = await ctx.db
      .query("entity_relations")
      .withIndex("by_user_from", (q) =>
        q.eq("userId", args.userId).eq("fromEntityId", args.entityId),
      )
      .order("desc")
      .take(limit);
    const incoming = await ctx.db
      .query("entity_relations")
      .withIndex("by_user_to", (q) => q.eq("userId", args.userId).eq("toEntityId", args.entityId))
      .order("desc")
      .take(limit);
    return { outgoing, incoming };
  },
});

const upsertArgs = v.object({
  canonicalName: v.string(),
  kind: v.string(),
  aliases: v.array(v.string()),
});

/**
 * Idempotent upsert keyed on (userId, kind, canonicalName). Aliases are merged
 * (set union, capped at 50 entries).
 */
export const upsertInternal = internalMutation({
  args: { userId: v.string(), entity: upsertArgs },
  handler: async (ctx, args): Promise<Id<"entities">> => {
    const existing = await ctx.db
      .query("entities")
      .withIndex("by_user_kind_name", (q) =>
        q
          .eq("userId", args.userId)
          .eq("kind", args.entity.kind)
          .eq("canonicalName", args.entity.canonicalName),
      )
      .unique();
    const now = Date.now();
    if (existing === null) {
      const id = await ctx.db.insert("entities", {
        userId: args.userId,
        kind: args.entity.kind,
        canonicalName: args.entity.canonicalName,
        aliases: dedupeCapped(args.entity.aliases, 50),
        metadata: {},
        createdAt: now,
        updatedAt: now,
      });
      await writeAudit(ctx, {
        userId: args.userId,
        action: "entity.create",
        actor: FAKE_AUDIT_ACTOR,
        diff: { kind: args.entity.kind, canonicalName: args.entity.canonicalName },
      });
      return id;
    }
    const mergedAliases = dedupeCapped([...existing.aliases, ...args.entity.aliases], 50);
    await ctx.db.patch(existing._id, { aliases: mergedAliases, updatedAt: now });
    return existing._id;
  },
});

function dedupeCapped(values: readonly string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) {
      continue;
    }
    seen.add(v);
    out.push(v);
    if (out.length >= cap) {
      break;
    }
  }
  return out;
}

/**
 * Record a mention of an entity in a thought. No-op if the same
 * (entityId, thoughtId) pair already exists.
 */
export const mentionInternal = internalMutation({
  args: {
    userId: v.string(),
    entityId: v.id("entities"),
    thoughtId: v.id("thoughts"),
    span: v.optional(v.object({ start: v.number(), end: v.number() })),
  },
  handler: async (ctx, args): Promise<Id<"entity_mentions"> | null> => {
    const entity = await ctx.db.get(args.entityId);
    if (entity === null || entity.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Entity not found" });
    }
    const thought = await ctx.db.get(args.thoughtId);
    if (thought === null || thought.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    const existing: Doc<"entity_mentions">[] = await ctx.db
      .query("entity_mentions")
      .withIndex("by_user_entity", (q) => q.eq("userId", args.userId).eq("entityId", args.entityId))
      .collect();
    if (existing.some((m) => m.thoughtId === args.thoughtId)) {
      return null;
    }
    const row: {
      userId: string;
      entityId: Id<"entities">;
      thoughtId: Id<"thoughts">;
      createdAt: number;
      span?: { start: number; end: number };
    } = {
      userId: args.userId,
      entityId: args.entityId,
      thoughtId: args.thoughtId,
      createdAt: Date.now(),
    };
    if (args.span !== undefined) {
      row.span = args.span;
    }
    return await ctx.db.insert("entity_mentions", row);
  },
});

const relationArgs = v.object({
  fromEntityId: v.id("entities"),
  toEntityId: v.id("entities"),
  kind: v.string(),
  evidenceThoughtIds: v.array(v.id("thoughts")),
  confidence: v.number(),
});

/**
 * Upsert a relation between two entities. Keyed on (userId, from, to, kind):
 * if a relation with the same kind already exists, evidenceThoughtIds are
 * unioned and confidence is replaced by the max.
 */
export const relateInternal = internalMutation({
  args: { userId: v.string(), relation: relationArgs },
  handler: async (ctx, args): Promise<Id<"entity_relations">> => {
    const rel = args.relation;
    const from = await ctx.db.get(rel.fromEntityId);
    const to = await ctx.db.get(rel.toEntityId);
    if (from === null || to === null || from.userId !== args.userId || to.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Entity not found" });
    }
    const existing = await ctx.db
      .query("entity_relations")
      .withIndex("by_user_from", (q) =>
        q.eq("userId", args.userId).eq("fromEntityId", rel.fromEntityId),
      )
      .collect();
    const match = existing.find((r) => r.toEntityId === rel.toEntityId && r.kind === rel.kind);
    const now = Date.now();
    if (match === undefined) {
      return await ctx.db.insert("entity_relations", {
        userId: args.userId,
        fromEntityId: rel.fromEntityId,
        toEntityId: rel.toEntityId,
        kind: rel.kind,
        evidenceThoughtIds: rel.evidenceThoughtIds,
        confidence: rel.confidence,
        createdAt: now,
        updatedAt: now,
      });
    }
    const unionEvidence = Array.from(
      new Set([...match.evidenceThoughtIds, ...rel.evidenceThoughtIds]),
    );
    await ctx.db.patch(match._id, {
      evidenceThoughtIds: unionEvidence,
      confidence: Math.max(match.confidence, rel.confidence),
      updatedAt: now,
    });
    return match._id;
  },
});
