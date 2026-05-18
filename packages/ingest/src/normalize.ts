/**
 * Normalize text for content fingerprinting:
 * - trim leading/trailing whitespace
 * - collapse all interior whitespace runs (spaces, tabs, newlines) to a single space
 * - lowercase
 *
 * The fingerprint is intentionally insensitive to minor formatting differences
 * so re-captured content with slightly different whitespace or casing still
 * deduplicates.
 */
export function normalizeForFingerprint(content: string): string {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}
