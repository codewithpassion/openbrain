import { formatRelativeTime } from "../lib/format";

export interface JobRunLike {
  readonly _id: string;
  readonly name: string;
  readonly userId?: string | undefined;
  readonly status: "success" | "failure" | "skipped";
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly note?: string | undefined;
}

export interface JobRunRowModel {
  readonly id: string;
  readonly name: string;
  readonly scope: "user" | "global";
  readonly statusLabel: string;
  readonly statusKind: "success" | "warning" | "danger" | "neutral";
  readonly startedLabel: string;
  readonly durationMs: number;
  readonly note: string | null;
}

const STATUS_KIND: Record<JobRunLike["status"], JobRunRowModel["statusKind"]> = {
  success: "success",
  failure: "danger",
  skipped: "warning",
};

export function buildJobRunRowModels(
  rows: readonly JobRunLike[],
  now: number = Date.now(),
): readonly JobRunRowModel[] {
  return rows.map((r) => ({
    id: r._id,
    name: r.name,
    scope: r.userId === undefined ? "global" : "user",
    statusLabel: r.status,
    statusKind: STATUS_KIND[r.status],
    startedLabel: formatRelativeTime(r.startedAt, now),
    durationMs: Math.max(0, r.finishedAt - r.startedAt),
    note: r.note ?? null,
  }));
}
