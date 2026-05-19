import { formatRelativeTime } from "../lib/format";

export interface AuditRowLike {
  readonly _id: string;
  readonly thoughtId?: string | undefined;
  readonly action: string;
  readonly actor: string;
  readonly at: number;
  readonly diff: unknown;
}

export interface AuditRowModel {
  readonly id: string;
  readonly action: string;
  readonly actor: string;
  readonly thoughtId: string | null;
  readonly relativeTime: string;
  readonly diffSummary: string;
}

const SUMMARY_MAX = 160;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Render an audit `diff` field as a short summary suitable for a feed row.
 * The shape is `unknown` because `memory_audit.diff` is `v.any()` per schema —
 * narrow at the boundary and stringify defensively.
 */
export function summarizeDiff(diff: unknown): string {
  if (diff === null || diff === undefined) {
    return "(no diff)";
  }
  if (typeof diff === "string") {
    return diff.length > SUMMARY_MAX ? `${diff.slice(0, SUMMARY_MAX)}…` : diff;
  }
  if (!(isPlainObject(diff) || Array.isArray(diff))) {
    return String(diff);
  }
  const json = JSON.stringify(diff);
  return json.length > SUMMARY_MAX ? `${json.slice(0, SUMMARY_MAX)}…` : json;
}

export function buildAuditRowModels(
  rows: readonly AuditRowLike[],
  now: number = Date.now(),
): readonly AuditRowModel[] {
  return rows.map((r) => ({
    id: r._id,
    action: r.action,
    actor: r.actor,
    thoughtId: r.thoughtId ?? null,
    relativeTime: formatRelativeTime(r.at, now),
    diffSummary: summarizeDiff(r.diff),
  }));
}
