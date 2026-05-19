import { z } from "zod";

export const entityRelationsInputSchema = z.object({
  entityId: z.string().min(1),
  limit: z.number().int().min(1).max(500).default(100),
});
export type EntityRelationsInput = z.infer<typeof entityRelationsInputSchema>;

const relationRow = z.object({
  id: z.string().min(1),
  fromEntityId: z.string().min(1),
  toEntityId: z.string().min(1),
  kind: z.string().min(1),
  evidenceThoughtIds: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  updatedAt: z.number().positive(),
});

export const entityRelationsOutputSchema = z.object({
  outgoing: z.array(relationRow),
  incoming: z.array(relationRow),
});
export type EntityRelationsOutput = z.infer<typeof entityRelationsOutputSchema>;
