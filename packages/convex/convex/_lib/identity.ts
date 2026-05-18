import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel } from "../_generated/dataModel.js";

/**
 * Resolves the authenticated Clerk userId. Throws ConvexError({code:"UNAUTHENTICATED"})
 * when no identity is present. Every public query/mutation must call this first
 * (CLAUDE.md §6: tenancy is P0).
 */
export async function requireUserId(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });
  }
  return identity.subject;
}
