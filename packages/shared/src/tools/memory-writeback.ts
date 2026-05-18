import { z } from "zod";
import { ThoughtId } from "../ids";
import { MemoryOrigin } from "../memory";

/**
 * Trust grade allowed on writeback. `"instruction"` is intentionally excluded —
 * promotion to instruction grade requires `memory_review` with an explicit
 * human-confirmed mutation (see CLAUDE.md §7, ARCHITECTURE.md memory_use_policy).
 */
export const WritebackTrustGrade = z.enum(["evidence", "draft"]);
export type WritebackTrustGrade = z.infer<typeof WritebackTrustGrade>;

export const memoryWritebackInputSchema = z.object({
  content: z.string().min(1).max(50_000),
  source: z.string().min(1),
  origin: MemoryOrigin,
  trustGrade: WritebackTrustGrade.default("evidence"),
  agent: z.string().min(1).optional(),
  agentVersion: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).default([]),
  sourceRef: z
    .object({
      kind: z.string().min(1),
      uri: z.string().min(1),
      excerpt: z.string().min(1).optional(),
    })
    .optional(),
});
export type MemoryWritebackInput = z.infer<typeof memoryWritebackInputSchema>;

export const memoryWritebackOutputSchema = z.object({
  thoughtId: ThoughtId,
  trustGrade: WritebackTrustGrade,
});
export type MemoryWritebackOutput = z.infer<typeof memoryWritebackOutputSchema>;
