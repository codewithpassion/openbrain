import { formatRelativeTime, formatTopics } from "../lib/format";

export interface ThoughtLike {
  readonly _id: string;
  readonly content: string;
  readonly createdAt: number;
  readonly metadata: {
    readonly type?: string | undefined;
    readonly topics: readonly string[];
  };
}

export interface ThoughtCardModel {
  readonly id: string;
  readonly content: string;
  readonly typeLabel: string;
  readonly topicsLine: string;
  readonly relativeTime: string;
}

/**
 * Pure projection of a Convex thought document into the small view-model the
 * `<ThoughtCard />` component renders. Kept testable: no React, no Convex, no
 * date globals (the `now` argument defaults to `Date.now()` only for callers
 * who don't need determinism).
 */
export function buildThoughtCardModel(
  thought: ThoughtLike,
  now: number = Date.now(),
): ThoughtCardModel {
  return {
    id: thought._id,
    content: thought.content,
    typeLabel: thought.metadata.type ?? "thought",
    topicsLine: formatTopics(thought.metadata.topics),
    relativeTime: formatRelativeTime(thought.createdAt, now),
  };
}

/**
 * Client-side substring filter over the recent-thought feed. Search is a v2
 * follow-up (see README): this is the v1 stand-in. Matches against content and
 * topics, case-insensitively. An empty query returns the input unchanged.
 */
export function filterThoughts<T extends ThoughtLike>(items: readonly T[], query: string): T[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return [...items];
  }
  return items.filter((t) => {
    if (t.content.toLowerCase().includes(trimmed)) {
      return true;
    }
    return t.metadata.topics.some((topic) => topic.toLowerCase().includes(trimmed));
  });
}
