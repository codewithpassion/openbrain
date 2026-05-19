import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel.js";
import { internalMutation, mutation, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";

const BACKUP_VERSION = 1;

interface BundleThought {
  readonly id: string;
  readonly content: string;
  readonly source: string;
  readonly embeddingModel: string;
  readonly embeddingDims: number;
  readonly fingerprint: string;
  readonly createdAt: number;
  readonly metadata: Doc<"thoughts">["metadata"];
  readonly provenance: ReadonlyArray<{
    readonly origin: Doc<"memory_provenance">["origin"];
    readonly agent?: string;
    readonly agentVersion?: string;
    readonly sessionId?: string;
    readonly capturedAt: number;
  }>;
  readonly sourceRefs: ReadonlyArray<{
    readonly kind: string;
    readonly uri: string;
    readonly excerpt?: string;
  }>;
}

interface Bundle {
  readonly version: typeof BACKUP_VERSION;
  readonly userId: string;
  readonly exportedAt: number;
  readonly thoughts: readonly BundleThought[];
}

/**
 * Export everything the caller owns into a JSON-serializable bundle. The
 * dashboard offers it as a file download. Vectorize embeddings are *not*
 * included — they're regenerable from content and the bundle stays small.
 */
export const exportForUser = query({
  args: {},
  handler: async (ctx): Promise<Bundle> => {
    const userId = await requireUserId(ctx);
    const thoughts = await ctx.db
      .query("thoughts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();

    const result: BundleThought[] = [];
    for (const t of thoughts) {
      const prov = await ctx.db
        .query("memory_provenance")
        .withIndex("by_thought", (q) => q.eq("thoughtId", t._id))
        .collect();
      const refs = await ctx.db
        .query("memory_source_refs")
        .withIndex("by_thought", (q) => q.eq("thoughtId", t._id))
        .collect();
      result.push({
        id: t._id,
        content: t.content,
        source: t.source,
        embeddingModel: t.embeddingModel,
        embeddingDims: t.embeddingDims,
        fingerprint: t.fingerprint,
        createdAt: t.createdAt,
        metadata: t.metadata,
        provenance: prov.map((p) => buildProvenanceItem(p)),
        sourceRefs: refs.map((r) => buildSourceRefItem(r)),
      });
    }
    return {
      version: BACKUP_VERSION,
      userId,
      exportedAt: Date.now(),
      thoughts: result,
    };
  },
});

function buildProvenanceItem(p: Doc<"memory_provenance">): BundleThought["provenance"][number] {
  const out: {
    origin: Doc<"memory_provenance">["origin"];
    capturedAt: number;
    agent?: string;
    agentVersion?: string;
    sessionId?: string;
  } = { origin: p.origin, capturedAt: p.capturedAt };
  if (p.agent !== undefined) {
    out.agent = p.agent;
  }
  if (p.agentVersion !== undefined) {
    out.agentVersion = p.agentVersion;
  }
  if (p.sessionId !== undefined) {
    out.sessionId = p.sessionId;
  }
  return out;
}

function buildSourceRefItem(r: Doc<"memory_source_refs">): BundleThought["sourceRefs"][number] {
  const out: { kind: string; uri: string; excerpt?: string } = { kind: r.kind, uri: r.uri };
  if (r.excerpt !== undefined) {
    out.excerpt = r.excerpt;
  }
  return out;
}

const provenanceItemValidator = v.object({
  origin: v.union(
    v.literal("human"),
    v.literal("agent_inferred"),
    v.literal("agent_generated"),
    v.literal("import"),
  ),
  agent: v.optional(v.string()),
  agentVersion: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  capturedAt: v.number(),
});

const sourceRefItemValidator = v.object({
  kind: v.string(),
  uri: v.string(),
  excerpt: v.optional(v.string()),
});

const thoughtItemValidator = v.object({
  content: v.string(),
  source: v.string(),
  embeddingModel: v.string(),
  embeddingDims: v.number(),
  fingerprint: v.string(),
  metadata: v.object({
    type: v.optional(v.string()),
    topics: v.array(v.string()),
    people: v.array(v.string()),
    action_items: v.array(v.string()),
    dates_mentioned: v.array(v.string()),
  }),
  provenance: v.array(provenanceItemValidator),
  sourceRefs: v.array(sourceRefItemValidator),
});

type ThoughtItem = {
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: Doc<"thoughts">["metadata"];
  provenance: ReadonlyArray<{
    origin: Doc<"memory_provenance">["origin"];
    agent?: string;
    agentVersion?: string;
    sessionId?: string;
    capturedAt: number;
  }>;
  sourceRefs: ReadonlyArray<{ kind: string; uri: string; excerpt?: string }>;
};

interface RestoreSummary {
  imported: number;
  skipped: number;
}

async function insertOne(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  t: ThoughtItem,
): Promise<"skipped" | "imported"> {
  const existing = await ctx.db
    .query("thoughts")
    .withIndex("by_user_fingerprint", (q) =>
      q.eq("userId", userId).eq("fingerprint", t.fingerprint),
    )
    .unique();
  if (existing !== null) {
    return "skipped";
  }
  const now = Date.now();
  const thoughtId: Id<"thoughts"> = await ctx.db.insert("thoughts", {
    userId,
    content: t.content,
    source: t.source,
    embeddingModel: t.embeddingModel,
    embeddingDims: t.embeddingDims,
    fingerprint: t.fingerprint,
    metadata: t.metadata,
    createdAt: now,
    updatedAt: now,
  });
  for (const p of t.provenance) {
    const row: {
      thoughtId: Id<"thoughts">;
      userId: string;
      origin: typeof p.origin;
      capturedAt: number;
      agent?: string;
      agentVersion?: string;
      sessionId?: string;
    } = { thoughtId, userId, origin: p.origin, capturedAt: p.capturedAt };
    if (p.agent !== undefined) {
      row.agent = p.agent;
    }
    if (p.agentVersion !== undefined) {
      row.agentVersion = p.agentVersion;
    }
    if (p.sessionId !== undefined) {
      row.sessionId = p.sessionId;
    }
    await ctx.db.insert("memory_provenance", row);
  }
  for (const r of t.sourceRefs) {
    const row: {
      thoughtId: Id<"thoughts">;
      userId: string;
      kind: string;
      uri: string;
      excerpt?: string;
    } = { thoughtId, userId, kind: r.kind, uri: r.uri };
    if (r.excerpt !== undefined) {
      row.excerpt = r.excerpt;
    }
    await ctx.db.insert("memory_source_refs", row);
  }
  await writeAudit(ctx, {
    thoughtId,
    userId,
    action: "thought.restore",
    actor: userId,
    diff: { fingerprint: t.fingerprint, source: t.source },
  });
  return "imported";
}

async function restoreBatchCore(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  thoughts: readonly ThoughtItem[],
): Promise<RestoreSummary> {
  let imported = 0;
  let skipped = 0;
  for (const t of thoughts) {
    const outcome = await insertOne(ctx, userId, t);
    if (outcome === "imported") {
      imported += 1;
    } else {
      skipped += 1;
    }
  }
  return { imported, skipped };
}

/**
 * Internal-only restore for the orchestrator path (e.g. a future Importer
 * running inside a Convex action). Takes an explicit userId.
 */
export const restoreBatchInternal = internalMutation({
  args: { userId: v.string(), thoughts: v.array(thoughtItemValidator) },
  handler: async (ctx, args): Promise<RestoreSummary> => {
    return await restoreBatchCore(ctx, args.userId, args.thoughts);
  },
});

/**
 * Public dashboard entry-point: trusts the authenticated session and applies
 * a parsed bundle batch. The dashboard chunks larger bundles into successive
 * calls so each mutation stays within Convex's request-size budget.
 */
export const restoreForCaller = mutation({
  args: { thoughts: v.array(thoughtItemValidator) },
  handler: async (ctx, args): Promise<RestoreSummary> => {
    const userId = await requireUserId(ctx);
    return await restoreBatchCore(ctx, userId, args.thoughts);
  },
});
