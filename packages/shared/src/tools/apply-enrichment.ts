import { z } from "zod";
import { ThoughtMetadata } from "../thoughts";
import { enrichThoughtInputSchema } from "./enrich-thought";

export const applyEnrichmentInputSchema = enrichThoughtInputSchema;
export type ApplyEnrichmentInput = z.infer<typeof applyEnrichmentInputSchema>;

export const applyEnrichmentOutputSchema = z.object({
  metadata: ThoughtMetadata,
  applied: z.boolean(),
});
export type ApplyEnrichmentOutput = z.infer<typeof applyEnrichmentOutputSchema>;
