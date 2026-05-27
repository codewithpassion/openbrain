const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SLUG_MAX_LEN = 64;

/**
 * Derives a Convex-acceptable project slug from a human name. Mirrors the
 * server-side regex in `packages/convex/convex/projects.ts`: lowercase
 * alphanumeric + hyphens, 1–64 chars, starting and ending alphanumeric.
 * Non-alphanumeric runs collapse into a single hyphen; leading/trailing
 * hyphens are trimmed. Returns empty string when nothing alphanumeric
 * survives — callers should treat that as "no suggestion yet".
 */
export function slugifyName(input: string): string {
  const collapsed = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (collapsed.length <= SLUG_MAX_LEN) {
    return collapsed;
  }
  return collapsed.slice(0, SLUG_MAX_LEN).replace(/-+$/g, "");
}

export type ProjectValidation =
  | { readonly ok: true; readonly name: string; readonly slug: string }
  | { readonly ok: false; readonly error: string };

interface ProjectInput {
  readonly name: string;
  readonly slug: string;
}

/**
 * Pre-flight check for the new-project dialog. The Convex mutation
 * re-validates server-side — this exists purely to surface inline errors
 * without a round-trip.
 */
export function validateProjectInput(input: ProjectInput): ProjectValidation {
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, error: "Give the project a name." };
  }
  const slug = input.slug.trim();
  if (slug.length === 0) {
    return { ok: false, error: "Slug is required." };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: "Slug must be lowercase alphanumeric with hyphens, max 64 characters.",
    };
  }
  return { ok: true, name, slug };
}
