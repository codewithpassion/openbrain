import { z } from "zod";
import { ThoughtId } from "../ids";

export const applySplitInputSchema = z.object({
  thoughtId: ThoughtId,
  maxIdeas: z.number().int().min(1).max(20).default(5),
});
export type ApplySplitInput = z.infer<typeof applySplitInputSchema>;

export const applySplitOutputSchema = z.object({
  created: z.number().int().nonnegative(),
  childIds: z.array(ThoughtId),
});
export type ApplySplitOutput = z.infer<typeof applySplitOutputSchema>;
