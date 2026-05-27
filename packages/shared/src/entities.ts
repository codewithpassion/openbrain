import { z } from "zod";
import { EntityId } from "./ids";

const NonEmptyString = z.string().min(1);
const Email = z.string().email();
// Loose: enough to keep junk out, but not strict enough to reject international
// numbers. Heavy validation lives in the form layer; storage should accept
// what the LLM extracted.
const Phone = z.string().min(3).max(40);

/**
 * Phase F: CRM-shaped metadata for `entities.metadata`. Convex stores this
 * field as `v.any()` (see CLAUDE.md §2 "Convex `v.any()` is not TypeScript
 * `any`") — Zod is the authoritative shape at the boundary.
 *
 * Discriminated by entity `kind`. Unknown kinds (e.g. "topic") map to an
 * empty shape; we don't try to model every domain here.
 */
export const personEntityMetadataSchema = z.object({
  title: NonEmptyString.optional(),
  company: EntityId.optional(), // references another entity row (kind: "org")
  email: Email.optional(),
  phone: Phone.optional(),
  last_contact_at: z.number().int().positive().optional(),
  notes: NonEmptyString.optional(),
});
export type PersonEntityMetadata = z.infer<typeof personEntityMetadataSchema>;

export const orgEntityMetadataSchema = z.object({
  industry: NonEmptyString.optional(),
  hq: NonEmptyString.optional(),
  headcount_estimate: z.number().int().nonnegative().optional(),
  notes: NonEmptyString.optional(),
});
export type OrgEntityMetadata = z.infer<typeof orgEntityMetadataSchema>;

/**
 * Wrapper schema that picks the right per-kind schema. Stored shape is
 * `{ kind, fields }`. The `kind` field mirrors the parent entity row's `kind`
 * so callers can revalidate after a fetch without losing context.
 */
export const entityMetadataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), fields: personEntityMetadataSchema }),
  z.object({ kind: z.literal("org"), fields: orgEntityMetadataSchema }),
]);
export type EntityMetadata = z.infer<typeof entityMetadataSchema>;

/**
 * Parse a `v.any()` blob coming out of Convex. Returns `null` (rather than
 * throwing) when the metadata is the placeholder empty object the upsert
 * helper writes — that lets the UI distinguish "no CRM data yet" from
 * "schema mismatch".
 */
export function tryParseEntityMetadata(raw: unknown, kind: string): EntityMetadata | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "object") {
    return null;
  }
  if (Object.keys(raw as Record<string, unknown>).length === 0) {
    return null;
  }
  if (kind === "person") {
    const parsed = personEntityMetadataSchema.safeParse(raw);
    if (parsed.success && Object.keys(parsed.data).length > 0) {
      return { kind: "person", fields: parsed.data };
    }
    return null;
  }
  if (kind === "org") {
    const parsed = orgEntityMetadataSchema.safeParse(raw);
    if (parsed.success && Object.keys(parsed.data).length > 0) {
      return { kind: "org", fields: parsed.data };
    }
    return null;
  }
  return null;
}
