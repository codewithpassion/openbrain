import { z } from "zod";
import { ThoughtId } from "../ids";
import { ThoughtType } from "../thoughts";

export const listThoughtsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  days: z.number().int().min(1).max(3_650).optional(),
  type: ThoughtType.optional(),
  topic: z.string().min(1).optional(),
  person: z.string().min(1).optional(),
});
export type ListThoughtsInput = z.infer<typeof listThoughtsInputSchema>;

export const listThoughtsOutputSchema = z.object({
  thoughts: z.array(
    z.object({
      id: ThoughtId,
      content: z.string().min(1),
      source: z.string().min(1),
      createdAt: z.number().positive(),
      type: ThoughtType.optional(),
    }),
  ),
});
export type ListThoughtsOutput = z.infer<typeof listThoughtsOutputSchema>;
