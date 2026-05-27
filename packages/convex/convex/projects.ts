import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc } from "./_generated/dataModel.js";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";

/**
 * Slug format: lowercase alphanumeric + hyphens, must start/end with
 * alphanumeric, 1–64 chars. Matches the URL/CLI surface this string ends up
 * in. Mirrored by the Zod schema in `@openbrains/shared` — the regex here is
 * a defense-in-depth check at the Convex boundary.
 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function assertValidSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new ConvexError({
      code: "INVALID_SLUG",
      message:
        "slug must be lowercase alphanumeric with hyphens, starting and ending with an alphanumeric character",
    });
  }
}

async function findBySlug(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  userId: string,
  slug: string,
): Promise<Doc<"projects"> | null> {
  return await ctx.db
    .query("projects")
    .withIndex("by_user_slug", (q) => q.eq("userId", userId).eq("slug", slug))
    .unique();
}

async function createCore(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  args: { slug: string; name: string; description?: string },
): Promise<string> {
  assertValidSlug(args.slug);
  const existing = await findBySlug(ctx, userId, args.slug);
  if (existing !== null) {
    throw new ConvexError({
      code: "SLUG_TAKEN",
      message: `Project slug "${args.slug}" already exists`,
    });
  }
  const now = Date.now();
  const row: {
    userId: string;
    slug: string;
    name: string;
    createdAt: number;
    description?: string;
  } = {
    userId,
    slug: args.slug,
    name: args.name,
    createdAt: now,
  };
  if (args.description !== undefined) {
    row.description = args.description;
  }
  const id = await ctx.db.insert("projects", row);
  await writeAudit(ctx, {
    userId,
    action: "project.create",
    actor: userId,
    diff: { slug: args.slug, name: args.name },
  });
  return id;
}

export const create = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await createCore(ctx, userId, args);
  },
});

export const createInternal = internalMutation({
  args: {
    userId: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, ...rest } = args;
    return await createCore(ctx, userId, rest);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("projects")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await findBySlug(ctx, userId, args.slug);
  },
});

export const getBySlugInternal = internalQuery({
  args: { userId: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    return await findBySlug(ctx, args.userId, args.slug);
  },
});

export const listInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

/**
 * Internal helper for write paths that accept an optional scope. Returns
 * `undefined` if no scope was supplied, otherwise validates the slug exists
 * for the user and returns the canonical slug. Throws PROJECT_NOT_FOUND when
 * the user references a scope they haven't created — typo protection.
 */
export async function resolveScope(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  userId: string,
  slug: string | undefined,
): Promise<string | undefined> {
  if (slug === undefined) {
    return undefined;
  }
  const project = await findBySlug(ctx, userId, slug);
  if (project === null) {
    throw new ConvexError({
      code: "PROJECT_NOT_FOUND",
      message: `Project "${slug}" does not exist`,
    });
  }
  return project.slug;
}
