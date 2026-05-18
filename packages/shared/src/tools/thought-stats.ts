import { z } from "zod";

export const thoughtStatsInputSchema = z.object({
  days: z.number().int().min(1).max(3_650).optional(),
});
export type ThoughtStatsInput = z.infer<typeof thoughtStatsInputSchema>;

const NonNegativeInt = z.number().int().min(0);

export const thoughtStatsOutputSchema = z.object({
  total: NonNegativeInt,
  byType: z.record(z.string().min(1), NonNegativeInt),
  topTopics: z.array(
    z.object({
      topic: z.string().min(1),
      count: NonNegativeInt,
    }),
  ),
  topPeople: z.array(
    z.object({
      person: z.string().min(1),
      count: NonNegativeInt,
    }),
  ),
});
export type ThoughtStatsOutput = z.infer<typeof thoughtStatsOutputSchema>;
