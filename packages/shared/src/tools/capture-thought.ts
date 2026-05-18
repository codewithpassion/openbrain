import { z } from "zod";
import { ThoughtId } from "../ids";

export const captureThoughtInputSchema = z.object({
  content: z.string().min(1).max(50_000),
  source: z.string().min(1),
});
export type CaptureThoughtInput = z.infer<typeof captureThoughtInputSchema>;

export const captureThoughtOutputSchema = z.object({
  thoughtId: ThoughtId,
  duplicate: z.boolean(),
});
export type CaptureThoughtOutput = z.infer<typeof captureThoughtOutputSchema>;
