const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Truncate a string to `limit` characters, appending a single-char ellipsis
 * when truncation occurs. Empty inputs are returned as-is.
 */
export function truncate(input: string, limit: number): string {
  if (input.length === 0 || input.length <= limit) {
    return input;
  }
  return `${input.slice(0, limit)}…`;
}

/**
 * Format a millisecond timestamp as a human-readable, locale-free relative
 * description. Timestamps older than one week fall back to an ISO date.
 *
 * `now` is injectable for deterministic tests.
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const delta = now - timestamp;
  if (delta < 45_000) {
    return "just now";
  }
  if (delta < HOUR_MS) {
    return `${Math.round(delta / MINUTE_MS)} min ago`;
  }
  if (delta < DAY_MS) {
    return `${Math.round(delta / HOUR_MS)} hr ago`;
  }
  if (delta < WEEK_MS) {
    return `${Math.round(delta / DAY_MS)} days ago`;
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Render a topic array as a single line suitable for a card subtitle.
 * Empty arrays return the empty string so the caller can short-circuit
 * rendering.
 */
export function formatTopics(topics: readonly string[]): string {
  return topics.join(" · ");
}
