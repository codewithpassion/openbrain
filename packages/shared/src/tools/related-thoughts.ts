import { z } from "zod";
import { ThoughtId } from "../ids";

export const relatedThoughtsInputSchema = z.object({
  thoughtId: ThoughtId,
  limit: z.number().int().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).default(0.85),
});
export type RelatedThoughtsInput = z.infer<typeof relatedThoughtsInputSchema>;

export const relatedThoughtsOutputSchema = z.object({
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
export type RelatedThoughtsOutput = z.infer<typeof relatedThoughtsOutputSchema>;
