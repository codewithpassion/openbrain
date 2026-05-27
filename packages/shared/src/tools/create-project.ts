import { z } from "zod";
import { ProjectId, ProjectSlug } from "../ids";

export const createProjectInputSchema = z.object({
  slug: ProjectSlug,
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const createProjectOutputSchema = z.object({
  projectId: ProjectId,
  slug: ProjectSlug,
});
export type CreateProjectOutput = z.infer<typeof createProjectOutputSchema>;
