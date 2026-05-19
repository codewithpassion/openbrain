import { formatRelativeTime } from "../lib/format";

export interface InspectorReviewLike {
  readonly _id: string;
  readonly thoughtId: string;
  readonly status: "unreviewed" | "confirmed" | "rejected" | "needs_revision";
  readonly reviewer: string;
  readonly reviewedAt: number;
  readonly note?: string | undefined;
  readonly _creationTime: number;
}

export interface InspectorRowModel {
  readonly id: string;
  readonly thoughtId: string;
  readonly statusLabel: string;
  readonly statusKind: "success" | "warning" | "danger" | "neutral";
  readonly reviewer: string;
  readonly relativeTime: string;
  readonly note: string | null;
}

const STATUS_LABELS: Record<InspectorReviewLike["status"], string> = {
  unreviewed: "unreviewed",
  confirmed: "confirmed",
  rejected: "rejected",
  needs_revision: "needs revision",
};

const STATUS_KIND: Record<InspectorReviewLike["status"], InspectorRowModel["statusKind"]> = {
  unreviewed: "neutral",
  confirmed: "success",
  rejected: "danger",
  needs_revision: "warning",
};

export function buildInspectorRowModels(
  rows: readonly InspectorReviewLike[],
  now: number = Date.now(),
): readonly InspectorRowModel[] {
  return rows.map((r) => ({
    id: r._id,
    thoughtId: r.thoughtId,
    statusLabel: STATUS_LABELS[r.status],
    statusKind: STATUS_KIND[r.status],
    reviewer: r.reviewer,
    relativeTime: formatRelativeTime(r.reviewedAt, now),
    note: r.note ?? null,
  }));
}

export type InspectorFilter = "all" | InspectorReviewLike["status"];

export function nextInspectorFilter(current: InspectorFilter, value: string): InspectorFilter {
  if (
    value === "all" ||
    value === "unreviewed" ||
    value === "confirmed" ||
    value === "rejected" ||
    value === "needs_revision"
  ) {
    return value;
  }
  return current;
}
