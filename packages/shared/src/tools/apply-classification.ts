import { z } from "zod";
import { ThoughtType } from "../thoughts";
import { classifyThoughtInputSchema } from "./classify-thought";

export const applyClassificationInputSchema = classifyThoughtInputSchema;
export type ApplyClassificationInput = z.infer<typeof applyClassificationInputSchema>;

export const applyClassificationOutputSchema = z.object({
  type: ThoughtType,
  applied: z.boolean(),
});
export type ApplyClassificationOutput = z.infer<typeof applyClassificationOutputSchema>;
