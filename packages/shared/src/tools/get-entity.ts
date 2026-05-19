import { z } from "zod";

export const getEntityInputSchema = z.object({
  id: z.string().min(1),
  mentionsLimit: z.number().int().min(0).max(500).default(50),
});
export type GetEntityInput = z.infer<typeof getEntityInputSchema>;

export const getEntityOutputSchema = z.object({
  entity: z
    .object({
      id: z.string().min(1),
      kind: z.string().min(1),
      canonicalName: z.string().min(1),
      aliases: z.array(z.string()),
      updatedAt: z.number().positive(),
    })
    .nullable(),
  mentions: z.array(
    z.object({
      thoughtId: z.string().min(1),
      createdAt: z.number().positive(),
    }),
  ),
});
export type GetEntityOutput = z.infer<typeof getEntityOutputSchema>;
