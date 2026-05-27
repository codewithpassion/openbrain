import { z } from "zod";
import { projectSchema } from "../projects";

export const listProjectsInputSchema = z.object({});
export type ListProjectsInput = z.infer<typeof listProjectsInputSchema>;

export const listProjectsOutputSchema = z.object({
  projects: z.array(projectSchema),
});
export type ListProjectsOutput = z.infer<typeof listProjectsOutputSchema>;
