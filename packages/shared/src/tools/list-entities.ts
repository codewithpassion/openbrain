import { z } from "zod";

export const listEntitiesInputSchema = z.object({
  kind: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
export type ListEntitiesInput = z.infer<typeof listEntitiesInputSchema>;

const entityRow = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  canonicalName: z.string().min(1),
  aliases: z.array(z.string()),
  updatedAt: z.number().positive(),
});

export const listEntitiesOutputSchema = z.object({
  entities: z.array(entityRow),
});
export type ListEntitiesOutput = z.infer<typeof listEntitiesOutputSchema>;
