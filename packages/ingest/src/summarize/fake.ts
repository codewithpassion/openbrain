import type { DigestSourceThought, DigestSummarizer, DigestSummary } from "./types";

/**
 * Test/dev summarizer: returns a deterministic summary built from the input
 * count and the first few topics. Never makes a network call.
 */
export function createFakeDigestSummarizer(opts?: { generator?: string }): DigestSummarizer {
  const generator = opts?.generator ?? "fake:digest";
  function summarize(thoughts: readonly DigestSourceThought[]): Promise<DigestSummary> {
    const thoughtIds = thoughts.map((t) => t.id);
    if (thoughts.length === 0) {
      return Promise.resolve({ summary: "No thoughts captured.", thoughtIds: [], generator });
    }
    const topics = new Set<string>();
    for (const t of thoughts) {
      for (const topic of t.topics) {
        topics.add(topic);
      }
    }
    const lines = [`- Captured ${thoughts.length} thought(s).`];
    if (topics.size > 0) {
      lines.push(`- Topics: ${[...topics].slice(0, 5).join(", ")}.`);
    }
    return Promise.resolve({ summary: lines.join("\n"), thoughtIds, generator });
  }
  return { summarize };
}
