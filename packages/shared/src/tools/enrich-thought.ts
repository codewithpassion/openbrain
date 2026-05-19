import { z } from "zod";
import { ThoughtId } from "../ids";
import { ThoughtMetadata } from "../thoughts";

export const enrichThoughtInputSchema = z.object({
  thoughtId: ThoughtId,
});
export type EnrichThoughtInput = z.infer<typeof enrichThoughtInputSchema>;

export const enrichThoughtOutputSchema = z.object({
  metadata: ThoughtMetadata,
});
export type EnrichThoughtOutput = z.infer<typeof enrichThoughtOutputSchema>;
