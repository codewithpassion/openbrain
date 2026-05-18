import { z } from "zod";
import { ThoughtId } from "../ids";
import { MemoryReviewStatus, TrustGrade } from "../memory";

export const memoryReviewInputSchema = z.object({
  thoughtId: ThoughtId,
  status: MemoryReviewStatus,
  promoteTo: TrustGrade.optional(),
  note: z.string().min(1).max(2_000).optional(),
});
export type MemoryReviewInput = z.infer<typeof memoryReviewInputSchema>;

export const memoryReviewOutputSchema = z.object({
  thoughtId: ThoughtId,
  status: MemoryReviewStatus,
  trustGrade: TrustGrade,
});
export type MemoryReviewOutput = z.infer<typeof memoryReviewOutputSchema>;
