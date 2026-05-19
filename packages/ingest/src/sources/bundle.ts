import { z } from "zod";
import type { BrainBundle, BrainBundleThought } from "./types";

const provenanceSchema = z.object({
  origin: z.enum(["human", "agent_inferred", "agent_generated", "import"]),
  agent: z.string().optional(),
  agentVersion: z.string().optional(),
  sessionId: z.string().optional(),
  capturedAt: z.number(),
});

const sourceRefSchema = z.object({
  kind: z.string(),
  uri: z.string(),
  excerpt: z.string().optional(),
});

const thoughtSchema = z.object({
  id: z.string(),
  content: z.string(),
  source: z.string(),
  embeddingModel: z.string(),
  embeddingDims: z.number().int().positive(),
  fingerprint: z.string().min(1),
  createdAt: z.number(),
  metadata: z.object({
    type: z.string().optional(),
    topics: z.array(z.string()),
    people: z.array(z.string()),
    action_items: z.array(z.string()),
    dates_mentioned: z.array(z.string()),
  }),
  provenance: z.array(provenanceSchema).optional(),
  sourceRefs: z.array(sourceRefSchema).optional(),
});

const bundleSchema = z.object({
  version: z.literal(1),
  userId: z.string().min(1),
  exportedAt: z.number(),
  thoughts: z.array(thoughtSchema),
});

export function parseBrainBundle(input: unknown): BrainBundle {
  return bundleSchema.parse(input) as BrainBundle;
}

export function tryParseBrainBundle(
  input: unknown,
): { ok: true; bundle: BrainBundle } | { ok: false; error: string } {
  const out = bundleSchema.safeParse(input);
  if (out.success) {
    return { ok: true, bundle: out.data as BrainBundle };
  }
  return { ok: false, error: out.error.issues.map((i) => i.message).join("; ") };
}

export function buildBrainBundle(
  userId: string,
  thoughts: readonly BrainBundleThought[],
  now: number = Date.now(),
): BrainBundle {
  return { version: 1, userId, exportedAt: now, thoughts };
}
