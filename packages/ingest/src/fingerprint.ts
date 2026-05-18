import { normalizeForFingerprint } from "./normalize";

/**
 * Content fingerprint: SHA-256 hex of the normalized content.
 *
 * Uses Web Crypto `crypto.subtle.digest` to stay portable across Bun, Node,
 * and Cloudflare Workers — no Node-only `node:crypto` import. The function is
 * async because `subtle.digest` is async; callers in the ingestion pipeline
 * are already inside `async` actions.
 */
export async function contentFingerprint(content: string): Promise<string> {
  const normalized = normalizeForFingerprint(content);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}
