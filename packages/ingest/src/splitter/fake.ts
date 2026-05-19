import type { BrainDumpIdea, BrainDumpSplitter } from "./types";

/**
 * Deterministic splitter for tests: splits on lines that start with "- " or
 * blank-line-separated paragraphs. No LLM. Returns at most `maxIdeas`.
 */
export function createFakeBrainDumpSplitter(): BrainDumpSplitter {
  return {
    split: (content, maxIdeas) => {
      const lines = content
        .split(/\n+/)
        .map((l) => l.replace(/^[-*]\s+/, "").trim())
        .filter((l) => l.length > 0);
      const ideas: BrainDumpIdea[] = lines
        .slice(0, maxIdeas)
        .map((c) => ({ content: c, topics: [] }));
      return Promise.resolve(ideas);
    },
  };
}
