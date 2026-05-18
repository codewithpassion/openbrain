import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel.js";
import { mutation, query } from "../_generated/server.js";
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

export const add = mutation({
  args: {
    thoughtId: v.id("thoughts"),
    kind: v.string(),
    uri: v.string(),
    excerpt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedThought(ctx, args.thoughtId, userId);
    const row: {
      thoughtId: Id<"thoughts">;
      userId: string;
      kind: string;
      uri: string;
      excerpt?: string;
    } = { thoughtId: args.thoughtId, userId, kind: args.kind, uri: args.uri };
    if (args.excerpt !== undefined) {
      row.excerpt = args.excerpt;
    }
    const id = await ctx.db.insert("memory_source_refs", row);
    await writeAudit(ctx, {
      thoughtId: args.thoughtId,
      userId,
      action: "sourceRefs.add",
      actor: userId,
      diff: { kind: args.kind, uri: args.uri },
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
      .query("memory_source_refs")
      .withIndex("by_thought", (q) => q.eq("thoughtId", args.thoughtId))
      .collect();
  },
});
