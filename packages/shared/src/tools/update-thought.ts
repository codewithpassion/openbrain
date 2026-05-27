import { z } from "zod";
import { ThoughtId } from "../ids";

export const updateThoughtInputSchema = z.object({
  thoughtId: ThoughtId,
  content: z.string().min(1).max(50_000),
});
export type UpdateThoughtInput = z.infer<typeof updateThoughtInputSchema>;

export const updateThoughtOutputSchema = z.object({
  thoughtId: ThoughtId,
  /** True if the new content's fingerprint differs from the old one. */
  reEmbedded: z.boolean(),
});
export type UpdateThoughtOutput = z.infer<typeof updateThoughtOutputSchema>;
