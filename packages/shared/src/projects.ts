import { z } from "zod";
import { ProjectId, ProjectSlug } from "./ids";

/**
 * A project ("scope") is a namespace inside a user's brain. Thoughts can be
 * tagged with a project slug to allow targeting a subset of memory.
 * Unscoped (no slug) thoughts remain visible across every project view.
 */
export const projectSchema = z.object({
  id: ProjectId,
  slug: ProjectSlug,
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).optional(),
  createdAt: z.number().positive(),
});
export type Project = z.infer<typeof projectSchema>;
