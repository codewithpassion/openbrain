import { z } from "zod";
import { ThoughtType } from "../thoughts";

export const panBrainDumpInputSchema = z.object({
  content: z.string().min(1).max(50_000),
  maxIdeas: z.number().int().min(1).max(20).default(5),
});
export type PanBrainDumpInput = z.infer<typeof panBrainDumpInputSchema>;

export const panBrainDumpOutputSchema = z.object({
  ideas: z.array(
    z.object({
      content: z.string().min(1),
      type: ThoughtType.optional(),
      topics: z.array(z.string().min(1)).default([]),
    }),
  ),
});
export type PanBrainDumpOutput = z.infer<typeof panBrainDumpOutputSchema>;
