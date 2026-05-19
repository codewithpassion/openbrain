import type { EntityExtractor, ExtractionResult } from "./types";

/**
 * Deterministic extractor for tests. Pulls capitalized tokens of length >= 3
 * and emits them as "topic" entities; emits no relations. Real extraction is
 * a job for the OpenRouter adapter.
 */
export function createFakeEntityExtractor(): EntityExtractor {
  function extract(content: string): Promise<ExtractionResult> {
    const seen = new Set<string>();
    const out: { canonicalName: string; kind: string; aliases: string[] }[] = [];
    // No trailing `\b` — we still want to extract "Qwen" from "Qwen3", treating
    // it as the entity even when followed by digits. The leading boundary keeps
    // us from picking up mid-word capitals.
    for (const match of content.matchAll(/\b[A-Z][a-zA-Z]{2,}/g)) {
      const name = match[0];
      if (!seen.has(name)) {
        seen.add(name);
        out.push({ canonicalName: name, kind: "topic", aliases: [] });
      }
    }
    return Promise.resolve({ entities: out, relations: [] });
  }
  return { extract };
}
