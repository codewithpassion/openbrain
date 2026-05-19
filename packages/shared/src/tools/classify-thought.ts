import { z } from "zod";
import { ThoughtId } from "../ids";
import { ThoughtType } from "../thoughts";

export const classifyThoughtInputSchema = z.object({
  thoughtId: ThoughtId,
});
export type ClassifyThoughtInput = z.infer<typeof classifyThoughtInputSchema>;

export const classifyThoughtOutputSchema = z.object({
  type: ThoughtType,
});
export type ClassifyThoughtOutput = z.infer<typeof classifyThoughtOutputSchema>;
