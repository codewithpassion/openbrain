import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { DataModel, Doc, Id } from "./_generated/dataModel.js";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";
import { resolveScope } from "./projects.js";

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
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await resolveScope(ctx, userId, args.scope);
    const coreArgs: {
      content: string;
      source: string;
      embeddingModel: string;
      embeddingDims: number;
      fingerprint: string;
      metadata: Doc<"thoughts">["metadata"];
      scope?: string;
    } = {
      content: args.content,
      source: args.source,
      embeddingModel: args.embeddingModel,
      embeddingDims: args.embeddingDims,
      fingerprint: args.fingerprint,
      metadata: args.metadata,
    };
    if (scope !== undefined) {
      coreArgs.scope = scope;
    }
    return await createThoughtCore(ctx, userId, coreArgs);
  },
});

/**
 * Phase E hook: when a thought lands without `metadata.type`, fire the
 * adaptive-capture-classification action. Kept here (not in the action file)
 * because mutations are the only context that can call `ctx.scheduler`.
 *
 * No-ops when the type is already set — saves an action invocation and the
 * memory_audit row that would follow.
 */
async function scheduleClassifyOnCapture(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  thoughtId: Id<"thoughts">,
  type: string | undefined,
): Promise<void> {
  if (type !== undefined && type !== "") {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.thoughtsAction.classifyOnCaptureInternal, {
    userId,
    thoughtId,
  });
}

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
  args: { limit: v.optional(v.number()), scope: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = args.limit ?? 50;
    if (args.scope !== undefined) {
      return await ctx.db
        .query("thoughts")
        .withIndex("by_user_scope_created", (q) => q.eq("userId", userId).eq("scope", args.scope))
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("thoughts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Look up a thought by fingerprint. When `scope` is supplied, dedup is
 * scoped — the same content can exist as separate thoughts in different
 * projects. When `scope` is omitted, looks in the unscoped (global)
 * namespace. To find across all scopes, omit scope on the call site that
 * wants that semantic (rare — typically only debug tools).
 */
export const getByFingerprint = query({
  args: { fingerprint: v.string(), scope: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await getByFingerprintCore(ctx, userId, args.fingerprint, args.scope);
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
    // Capture before delete — the action runs after this mutation commits and
    // the row will be gone. Convention: row.vectorizeId is usually undefined
    // because `captureThought` doesn't write it back; the vector ID is the
    // thoughtId itself in that case.
    const vectorizeId = row.vectorizeId ?? (args.id as string);
    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      thoughtId: args.id,
      userId,
      action: "thought.delete",
      actor: userId,
      diff: { deleted: true, vectorizeId },
    });
    await ctx.scheduler.runAfter(0, internal.thoughtsAction.deleteVectorInternal, {
      userId,
      vectorizeId,
    });
  },
});

/**
 * Patch a thought's content. The caller (MCP Worker or dashboard) is
 * responsible for supplying the new fingerprint, metadata, and embedding
 * model/dims — re-embedding lives outside Convex.
 *
 * Fingerprint uniqueness: if the new fingerprint already exists on *another*
 * thought owned by this user, throw FINGERPRINT_COLLISION so the caller can
 * surface that the edit would create a duplicate.
 */
export const updateContent = mutation({
  args: {
    id: v.id("thoughts"),
    content: v.string(),
    fingerprint: v.string(),
    metadata: metadataValidator,
    embeddingModel: v.optional(v.string()),
    embeddingDims: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await updateContentCore(ctx, userId, args);
  },
});

async function updateContentCore(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  args: {
    id: Id<"thoughts">;
    content: string;
    fingerprint: string;
    metadata: Doc<"thoughts">["metadata"];
    embeddingModel?: string;
    embeddingDims?: number;
  },
): Promise<void> {
  const row = await ctx.db.get(args.id);
  if (row === null || row.userId !== userId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
  }
  if (args.fingerprint !== row.fingerprint) {
    // Collision check is scope-aware — the same fingerprint can exist in a
    // different scope without colliding.
    const collision = await getByFingerprintCore(ctx, userId, args.fingerprint, row.scope);
    if (collision !== null && collision._id !== args.id) {
      throw new ConvexError({
        code: "FINGERPRINT_COLLISION",
        message: "Another thought already has this fingerprint",
      });
    }
  }
  const patch: {
    content: string;
    fingerprint: string;
    metadata: Doc<"thoughts">["metadata"];
    updatedAt: number;
    embeddingModel?: string;
    embeddingDims?: number;
  } = {
    content: args.content,
    fingerprint: args.fingerprint,
    metadata: args.metadata,
    updatedAt: Date.now(),
  };
  if (args.embeddingModel !== undefined) {
    patch.embeddingModel = args.embeddingModel;
  }
  if (args.embeddingDims !== undefined) {
    patch.embeddingDims = args.embeddingDims;
  }
  await ctx.db.patch(args.id, patch);
  await writeAudit(ctx, {
    thoughtId: args.id,
    userId,
    action: "thought.updateContent",
    actor: userId,
    diff: { content: args.content, fingerprint: args.fingerprint },
  });
  // Auto re-embed: the content changed, so any previous Vectorize entry now
  // points at stale text. Best-effort — the action returns `skipped` if the
  // MCP Worker env isn't wired (see thoughtsAction.reembedInternal).
  await ctx.scheduler.runAfter(0, internal.thoughtsAction.reembedInternal, {
    userId,
    thoughtId: args.id,
  });
  // Re-extract entities from the new content. The action first wipes any
  // stale mentions / relation-evidence for this thought via
  // `entities.clearForThoughtInternal`, then upserts what the LLM finds in
  // the new content. Best-effort like the reembed.
  await ctx.scheduler.runAfter(0, internal.entitiesAction.extractFromThoughtInternal, {
    userId,
    thoughtId: args.id,
    content: args.content,
  });
}

/**
 * Internal variant called by the MCP Worker via http.ts. Takes `userId` as a
 * parameter; bypasses `requireUserId`. Trust boundary lives at http.ts.
 */
export const updateContentInternal = internalMutation({
  args: {
    userId: v.string(),
    id: v.id("thoughts"),
    content: v.string(),
    fingerprint: v.string(),
    metadata: metadataValidator,
    embeddingModel: v.optional(v.string()),
    embeddingDims: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, ...rest } = args;
    await updateContentCore(ctx, userId, rest);
  },
});

/**
 * Manually re-index a thought's vector. Used by the dashboard's "Reindex"
 * button to recover when an auto-reindex skipped or failed. Schedules the
 * same action `updateContent` does — the action is the only place the
 * embedding model + Vectorize binding live.
 */
export const reembedThought = mutation({
  args: { id: v.id("thoughts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null || row.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    await ctx.scheduler.runAfter(0, internal.thoughtsAction.reembedInternal, {
      userId,
      thoughtId: args.id,
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
    parentThoughtId?: Id<"thoughts">;
    scope?: string;
  },
): Promise<Id<"thoughts">> {
  const now = Date.now();
  const row: {
    userId: string;
    content: string;
    source: string;
    embeddingModel: string;
    embeddingDims: number;
    fingerprint: string;
    metadata: Doc<"thoughts">["metadata"];
    createdAt: number;
    updatedAt: number;
    parentThoughtId?: Id<"thoughts">;
    scope?: string;
  } = {
    userId,
    content: args.content,
    source: args.source,
    embeddingModel: args.embeddingModel,
    embeddingDims: args.embeddingDims,
    fingerprint: args.fingerprint,
    metadata: args.metadata,
    createdAt: now,
    updatedAt: now,
  };
  if (args.parentThoughtId !== undefined) {
    row.parentThoughtId = args.parentThoughtId;
  }
  if (args.scope !== undefined) {
    row.scope = args.scope;
  }
  const id = await ctx.db.insert("thoughts", row);
  await writeAudit(ctx, {
    thoughtId: id,
    userId,
    action: "thought.create",
    actor: userId,
    diff: { content: args.content, source: args.source, scope: args.scope ?? null },
  });
  await scheduleClassifyOnCapture(ctx, userId, id, args.metadata.type);
  await ctx.scheduler.runAfter(0, internal.entitiesAction.extractFromThoughtInternal, {
    userId,
    thoughtId: id,
    content: args.content,
  });
  return id;
}

/**
 * Scope-aware fingerprint lookup. Same content can exist in different
 * scopes — dedup is per (userId, scope). Used by capture flows in
 * services/capture-thought.ts and by internal MCP routes.
 */
async function getByFingerprintCore(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  userId: string,
  fingerprint: string,
  scope: string | undefined,
): Promise<Doc<"thoughts"> | null> {
  return await ctx.db
    .query("thoughts")
    .withIndex("by_user_scope_fingerprint", (q) =>
      q.eq("userId", userId).eq("scope", scope).eq("fingerprint", fingerprint),
    )
    .unique();
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
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx, args.userId, args.scope);
    const coreArgs: {
      content: string;
      source: string;
      embeddingModel: string;
      embeddingDims: number;
      fingerprint: string;
      metadata: Doc<"thoughts">["metadata"];
      scope?: string;
    } = {
      content: args.content,
      source: args.source,
      embeddingModel: args.embeddingModel,
      embeddingDims: args.embeddingDims,
      fingerprint: args.fingerprint,
      metadata: args.metadata,
    };
    if (scope !== undefined) {
      coreArgs.scope = scope;
    }
    return await createThoughtCore(ctx, args.userId, coreArgs);
  },
});

export const listThoughtsInternal = internalQuery({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
    topic: v.optional(v.string()),
    person: v.optional(v.string()),
    days: v.optional(v.number()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    // We index by (userId, createdAt). When `scope` is supplied we switch to
    // `by_user_scope_created` so the scope filter is pushed down too.
    // `type` is filtered at the index layer via `q.filter`. `topic` and
    // `person` are JSON-array fields — Convex's `q.filter` lacks a native
    // array-contains, so those filters run in JS on the index-scoped result.
    let q =
      args.scope === undefined
        ? ctx.db
            .query("thoughts")
            .withIndex("by_user_created", (qq) => qq.eq("userId", args.userId))
            .order("desc")
        : ctx.db
            .query("thoughts")
            .withIndex("by_user_scope_created", (qq) =>
              qq.eq("userId", args.userId).eq("scope", args.scope),
            )
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
    return await filterByTopicAndPerson(q, args.topic, args.person, limit);
  },
});

async function filterByTopicAndPerson(
  q: AsyncIterable<Doc<"thoughts">>,
  topic: string | undefined,
  person: string | undefined,
  limit: number,
): Promise<Doc<"thoughts">[]> {
  const out: Doc<"thoughts">[] = [];
  for await (const row of q) {
    if (topic !== undefined && !row.metadata.topics.includes(topic)) {
      continue;
    }
    if (person !== undefined && !row.metadata.people.includes(person)) {
      continue;
    }
    out.push(row);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

export const getByFingerprintInternal = internalQuery({
  args: {
    userId: v.string(),
    fingerprint: v.string(),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await getByFingerprintCore(ctx, args.userId, args.fingerprint, args.scope);
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

// ---------------------------------------------------------------------------
// Phase E: persistence helpers consumed by `thoughtsAction.ts`.
//
// The actions (LLM-backed) call these internal mutations to commit results.
// Each one validates the userId/thoughtId boundary itself so the action layer
// can stay focused on orchestration.
// ---------------------------------------------------------------------------

/**
 * Patch a thought's embedding metadata after a re-embed pass. Called by
 * `thoughtsAction.reembedInternal` once the Worker has successfully upserted
 * the new vector. Writes a `thought.reembed` audit row so the dashboard can
 * show that an async re-index actually landed.
 */
export const setEmbeddingInternal = internalMutation({
  args: {
    userId: v.string(),
    thoughtId: v.id("thoughts"),
    embeddingModel: v.string(),
    embeddingDims: v.number(),
    vectorizeId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const row = await ctx.db.get(args.thoughtId);
    if (row === null || row.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    const patch: {
      embeddingModel: string;
      embeddingDims: number;
      updatedAt: number;
      vectorizeId?: string;
    } = {
      embeddingModel: args.embeddingModel,
      embeddingDims: args.embeddingDims,
      updatedAt: Date.now(),
    };
    if (args.vectorizeId !== undefined) {
      patch.vectorizeId = args.vectorizeId;
    }
    await ctx.db.patch(args.thoughtId, patch);
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId: args.userId,
      action: "thought.reembed",
      actor: "system",
      diff: {
        embeddingModel: args.embeddingModel,
        embeddingDims: args.embeddingDims,
        ...(args.vectorizeId === undefined ? {} : { vectorizeId: args.vectorizeId }),
      },
    });
  },
});

/**
 * Sets `metadata.type` on a thought. Returns `true` if the patch landed,
 * `false` if the thought already had a type set (the type is not overwritten —
 * adaptive-capture-classification only fills in the gap).
 */
export const setTypeInternal = internalMutation({
  args: {
    userId: v.string(),
    thoughtId: v.id("thoughts"),
    type: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const row = await ctx.db.get(args.thoughtId);
    if (row === null || row.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    if (row.metadata.type !== undefined && row.metadata.type !== "") {
      return false;
    }
    await ctx.db.patch(args.thoughtId, {
      metadata: { ...row.metadata, type: args.type },
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId: args.userId,
      action: "thought.setType",
      actor: "system",
      diff: { type: args.type },
    });
    return true;
  },
});

const metadataPartial = v.object({
  type: v.optional(v.string()),
  topics: v.array(v.string()),
  people: v.array(v.string()),
  action_items: v.array(v.string()),
  dates_mentioned: v.array(v.string()),
});

/**
 * Merges enrichment results into an existing thought's metadata. The merge is
 * **union for arrays** and **fill-only for `type`** — never overwrites a value
 * the user (or another agent) already supplied. This is the thought-enrichment
 * scheduled action's persistence path.
 */
export const mergeMetadataInternal = internalMutation({
  args: {
    userId: v.string(),
    thoughtId: v.id("thoughts"),
    metadata: metadataPartial,
  },
  handler: async (ctx, args): Promise<void> => {
    const row = await ctx.db.get(args.thoughtId);
    if (row === null || row.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
    }
    const resolvedType =
      row.metadata.type !== undefined && row.metadata.type !== ""
        ? row.metadata.type
        : args.metadata.type;
    const merged: Doc<"thoughts">["metadata"] = {
      topics: unionStrings(row.metadata.topics, args.metadata.topics),
      people: unionStrings(row.metadata.people, args.metadata.people),
      action_items: unionStrings(row.metadata.action_items, args.metadata.action_items),
      dates_mentioned: unionStrings(row.metadata.dates_mentioned, args.metadata.dates_mentioned),
    };
    if (resolvedType !== undefined && resolvedType !== "") {
      merged.type = resolvedType;
    }
    await ctx.db.patch(args.thoughtId, {
      metadata: merged,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId: args.userId,
      action: "thought.enrich",
      actor: "system",
      diff: { merged: true },
    });
  },
});

function unionStrings(existing: readonly string[], incoming: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...existing, ...incoming]) {
    if (v === "" || seen.has(v)) {
      continue;
    }
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Persist a brain-dump split. Each idea becomes its own thought with
 * `parentThoughtId` pointing at the source dump. Idempotent on
 * `(parentThoughtId, fingerprint)` — re-running for the same ideas does not
 * duplicate the children.
 *
 * The action layer is responsible for embedding + vectorize upsert; this
 * mutation only owns the Convex side.
 */
export const persistSplitInternal = internalMutation({
  args: {
    userId: v.string(),
    parentThoughtId: v.id("thoughts"),
    ideas: v.array(
      v.object({
        content: v.string(),
        type: v.optional(v.string()),
        topics: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ created: number; childIds: Id<"thoughts">[] }> => {
    const parent = await ctx.db.get(args.parentThoughtId);
    if (parent === null || parent.userId !== args.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Parent thought not found" });
    }
    const childIds: Id<"thoughts">[] = [];
    let created = 0;
    // Children inherit the parent's scope so the split stays inside the same
    // project. Dedup is scope-aware via getByFingerprintCore.
    const childScope = parent.scope;
    for (const idea of args.ideas) {
      const fingerprint = await childFingerprint(args.parentThoughtId, idea.content);
      const existing = await getByFingerprintCore(ctx, args.userId, fingerprint, childScope);
      if (existing !== null) {
        childIds.push(existing._id);
        continue;
      }
      const metadata: Doc<"thoughts">["metadata"] = {
        topics: [...idea.topics],
        people: [],
        action_items: [],
        dates_mentioned: [],
      };
      if (idea.type !== undefined && idea.type !== "") {
        metadata.type = idea.type;
      }
      const id = await createThoughtCore(ctx, args.userId, {
        content: idea.content,
        source: `split:${parent.source}`,
        embeddingModel: parent.embeddingModel,
        embeddingDims: parent.embeddingDims,
        fingerprint,
        metadata,
        parentThoughtId: args.parentThoughtId,
        ...(childScope === undefined ? {} : { scope: childScope }),
      });
      childIds.push(id);
      created += 1;
    }
    return { created, childIds };
  },
});

/**
 * Stable per-child fingerprint. Combines the parent id with the normalized
 * child content so re-splitting the same dump (same ideas, same parent) maps
 * to the same fingerprints. Hash kept short — these aren't full content
 * fingerprints, just collision-resistant identity keys for the dedup index.
 */
async function childFingerprint(parentId: Id<"thoughts">, content: string): Promise<string> {
  const data = new TextEncoder().encode(`${parentId}::${content.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Children of a parent brain-dump thought, ordered by createdAt asc so the
 * dashboard shows the split in the same order the splitter emitted them.
 */
export const childrenOfThought = query({
  args: { parentThoughtId: v.id("thoughts"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const parent = await ctx.db.get(args.parentThoughtId);
    if (parent === null || parent.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Parent thought not found" });
    }
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("thoughts")
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", userId).eq("parentThoughtId", args.parentThoughtId),
      )
      .order("asc")
      .take(limit);
  },
});

export const getThoughtInternal = internalQuery({
  args: { userId: v.string(), thoughtId: v.id("thoughts") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.thoughtId);
    if (row === null || row.userId !== args.userId) {
      return null;
    }
    return row;
  },
});
