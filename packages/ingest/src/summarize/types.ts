/**
 * One thought fed into a daily-digest summarizer. Intentionally a narrow shape
 * — we don't pass the full Convex doc to keep the package framework-neutral.
 */
export interface DigestSourceThought {
  readonly id: string;
  readonly content: string;
  readonly type?: string | undefined;
  readonly topics: readonly string[];
  readonly createdAt: number;
}

export interface DigestSummary {
  readonly summary: string;
  readonly thoughtIds: readonly string[];
  readonly generator: string;
}

export interface DigestSummarizer {
  summarize(thoughts: readonly DigestSourceThought[]): Promise<DigestSummary>;
}
