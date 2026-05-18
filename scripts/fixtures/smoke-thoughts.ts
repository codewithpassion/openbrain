/**
 * Canonical fixture set for the end-to-end smoke test.
 *
 * Each entry is a semantically distinct thought + a paraphrased query
 * that should surface the thought as the top match. Keep these
 * recognizable so a developer reading the output can tell at a glance
 * which assertion blew up.
 */

export interface SmokeFixture {
  readonly content: string;
  readonly expectedQuery: string;
}

export const SMOKE_THOUGHTS: readonly SmokeFixture[] = [
  {
    content: "My dog Luna eats kibble twice a day, morning and evening.",
    expectedQuery: "what does my dog Luna eat?",
  },
  {
    content: "Quarterly product review meeting is scheduled for May 30 at 14:00.",
    expectedQuery: "when is the quarterly review meeting?",
  },
  {
    content: "Idea: bundle the OpenBrains dashboard as a Progressive Web App so it works offline.",
    expectedQuery: "PWA dashboard offline idea",
  },
  {
    content: "Coffee subscription from Sey Coffee renews on the 15th of every month.",
    expectedQuery: "when does the Sey Coffee subscription renew?",
  },
  {
    content:
      "Action item: file the 2025 quarterly tax return for the Australian business by July 28.",
    expectedQuery: "Australian quarterly tax return deadline",
  },
  {
    content: "Met with Priya about the Vectorize index sharding strategy on Tuesday.",
    expectedQuery: "who did I talk to about Vectorize sharding?",
  },
  {
    content:
      "Book recommendation from Marco: 'Designing Data-Intensive Applications' by Martin Kleppmann.",
    expectedQuery: "Marco's book recommendation about data systems",
  },
  {
    content: "Reminder: renew passport before international travel to Japan in October 2026.",
    expectedQuery: "passport renewal Japan travel",
  },
  {
    content:
      "Bug observation: capture endpoint returns 503 when Vectorize metadata index is missing.",
    expectedQuery: "503 errors from the capture endpoint",
  },
  {
    content: "Personal goal: run a half-marathon under two hours by spring 2027.",
    expectedQuery: "half-marathon running goal",
  },
];
