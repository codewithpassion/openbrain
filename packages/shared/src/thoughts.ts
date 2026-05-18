import { z } from "zod";
import { ThoughtId, UserId } from "./ids";

const NonEmptyString = z.string().min(1);

export const ThoughtType = z.enum(["observation", "task", "idea", "reference", "person_note"]);
export type ThoughtType = z.infer<typeof ThoughtType>;

const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const ThoughtMetadata = z.object({
  type: ThoughtType.optional(),
  topics: z.array(NonEmptyString).default([]),
  people: z.array(NonEmptyString).default([]),
  action_items: z.array(NonEmptyString).default([]),
  dates_mentioned: z.array(IsoDateString).default([]),
});
export type ThoughtMetadata = z.infer<typeof ThoughtMetadata>;

export const Thought = z.object({
  id: ThoughtId,
  userId: UserId,
  content: z.string().min(1).max(50_000),
  source: NonEmptyString,
  embeddingModel: NonEmptyString,
  embeddingDims: z.number().int().positive(),
  fingerprint: Sha256Hex,
  metadata: ThoughtMetadata,
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
});
export type Thought = z.infer<typeof Thought>;
