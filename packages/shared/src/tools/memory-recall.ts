import { z } from "zod";
import { ProjectSlug, ThoughtId } from "../ids";
import { MemoryOrigin, TrustGrade } from "../memory";

export const memoryRecallInputSchema = z.object({
  query: z.string().min(1).max(2_000),
  limit: z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.5),
  minTrustGrade: TrustGrade.optional(),
  scope: ProjectSlug.optional(),
});
export type MemoryRecallInput = z.infer<typeof memoryRecallInputSchema>;

export const memoryRecallOutputSchema = z.object({
  results: z.array(
    z.object({
      id: ThoughtId,
      score: z.number().min(0).max(1),
      content: z.string().min(1),
      trustGrade: TrustGrade,
      origin: MemoryOrigin,
      createdAt: z.number().positive(),
    }),
  ),
});
export type MemoryRecallOutput = z.infer<typeof memoryRecallOutputSchema>;
