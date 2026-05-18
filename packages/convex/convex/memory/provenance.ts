import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel.js";
import { internalMutation, mutation, query } from "../_generated/server.js";
import { writeAudit } from "../_lib/audit.js";
import { requireUserId } from "../_lib/identity.js";

async function assertOwnedThought(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  thoughtId: Id<"thoughts">,
  userId: string,
): Promise<void> {
  const row = await ctx.db.get(thoughtId);
  if (row === null || row.userId !== userId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Thought not found" });
  }
}

const originValidator = v.union(
  v.literal("human"),
  v.literal("agent_inferred"),
  v.literal("agent_generated"),
  v.literal("import"),
);

export const record = mutation({
  args: {
    thoughtId: v.id("thoughts"),
    origin: originValidator,
    agent: v.optional(v.string()),
    agentVersion: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    const now = Date.now();
    const row: {
      thoughtId: Id<"thoughts">;
      userId: string;
      origin: typeof args.origin;
      capturedAt: number;
      agent?: string;
      agentVersion?: string;
      sessionId?: string;
    } = { thoughtId: args.thoughtId, userId, origin: args.origin, capturedAt: now };
    if (args.agent !== undefined) {
      row.agent = args.agent;
    }
    if (args.agentVersion !== undefined) {
      row.agentVersion = args.agentVersion;
    }
    if (args.sessionId !== undefined) {
      row.sessionId = args.sessionId;
    }
    const id = await ctx.db.insert("memory_provenance", row);
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId,
      action: "provenance.record",
      actor: userId,
      diff: { origin: args.origin },
    });
    return id;
  },
});

export const list = query({
  args: { thoughtId: v.id("thoughts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    return await ctx.db
      .query("memory_provenance")
      .withIndex("by_thought", (q) => q.eq("thoughtId", args.thoughtId))
      .collect();
  },
});

export const recordInternal = internalMutation({
  args: {
    userId: v.string(),
    thoughtId: v.id("thoughts"),
    origin: originValidator,
    agent: v.optional(v.string()),
    agentVersion: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row: {
      thoughtId: Id<"thoughts">;
      userId: string;
      origin: typeof args.origin;
      capturedAt: number;
      agent?: string;
      agentVersion?: string;
      sessionId?: string;
    } = {
      thoughtId: args.thoughtId,
      userId: args.userId,
      origin: args.origin,
      capturedAt: Date.now(),
    };
    if (args.agent !== undefined) {
      row.agent = args.agent;
    }
    if (args.agentVersion !== undefined) {
      row.agentVersion = args.agentVersion;
    }
    if (args.sessionId !== undefined) {
      row.sessionId = args.sessionId;
    }
    const id = await ctx.db.insert("memory_provenance", row);
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId: args.userId,
      action: "provenance.record",
      actor: args.userId,
      diff: { origin: args.origin },
    });
    return id;
  },
});
