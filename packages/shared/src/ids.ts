import { z } from "zod";

export const UserId = z.string().min(1).brand<"UserId">();
export type UserId = z.infer<typeof UserId>;

export const ThoughtId = z.string().min(1).brand<"ThoughtId">();
export type ThoughtId = z.infer<typeof ThoughtId>;

export const ApiKeyId = z.string().min(1).brand<"ApiKeyId">();
export type ApiKeyId = z.infer<typeof ApiKeyId>;

export const EntityId = z.string().min(1).brand<"EntityId">();
export type EntityId = z.infer<typeof EntityId>;

export const ProjectId = z.string().min(1).brand<"ProjectId">();
export type ProjectId = z.infer<typeof ProjectId>;

/**
 * URL/CLI-friendly project identifier. Lowercase alphanumeric with hyphens;
 * must start and end with an alphanumeric. Mirrored at the Convex boundary
 * in `convex/projects.ts`.
 */
export const ProjectSlug = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, {
    message:
      "slug must be lowercase alphanumeric with hyphens, starting and ending with an alphanumeric",
  })
  .brand<"ProjectSlug">();
export type ProjectSlug = z.infer<typeof ProjectSlug>;
