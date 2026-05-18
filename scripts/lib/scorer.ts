/**
 * Token-overlap scorer used by the in-process mock vectorize. We do NOT
 * pretend this is a semantic search engine — it's a deterministic
 * similarity proxy for fixtures with distinct vocabulary. Real Vectorize
 * does the heavy lifting in production.
 *
 * Score = (overlapping content tokens) / (total query tokens after stop-word filter).
 * Range [0, 1]. Empty query → 0.
 */

const STOP_WORDS = new Set<string>([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "do",
  "does",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
]);

function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok));
}

export function tokenOverlapScore(content: string, query: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return 0;
  }
  const contentTokens = new Set(tokenize(content));
  let hits = 0;
  for (const tok of queryTokens) {
    if (contentTokens.has(tok)) {
      hits += 1;
    }
  }
  return hits / queryTokens.length;
}
