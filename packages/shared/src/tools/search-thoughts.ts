import { z } from "zod";
import { ProjectSlug, ThoughtId } from "../ids";
import { ThoughtType } from "../thoughts";

export const searchThoughtsInputSchema = z.object({
  query: z.string().min(1).max(2_000),
  limit: z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.5),
  type: ThoughtType.optional(),
  topic: z.string().min(1).optional(),
  person: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  scope: ProjectSlug.optional(),
});
export type SearchThoughtsInput = z.infer<typeof searchThoughtsInputSchema>;

export const searchThoughtsOutputSchema = z.object({
  results: z.array(
    z.object({
      id: ThoughtId,
      score: z.number().min(0).max(1),
      content: z.string().min(1),
      source: z.string().min(1),
      createdAt: z.number().positive(),
    }),
  ),
});
export type SearchThoughtsOutput = z.infer<typeof searchThoughtsOutputSchema>;
