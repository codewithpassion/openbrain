import { formatRelativeTime } from "../lib/format";

export interface ImportLike {
  readonly _id: string;
  readonly source: string;
  readonly direction: "import" | "export";
  readonly status: "queued" | "running" | "success" | "failure" | "cancelled";
  readonly stats: {
    readonly processed: number;
    readonly created: number;
    readonly skipped: number;
    readonly errors: number;
  };
  readonly note?: string | undefined;
  readonly updatedAt: number;
}

export interface ImportRowModel {
  readonly id: string;
  readonly source: string;
  readonly direction: "import" | "export";
  readonly statusLabel: string;
  readonly statusKind: "success" | "warning" | "danger" | "neutral";
  readonly statsLine: string;
  readonly updatedLabel: string;
  readonly note: string | null;
}

const STATUS_KIND: Record<ImportLike["status"], ImportRowModel["statusKind"]> = {
  queued: "neutral",
  running: "neutral",
  success: "success",
  failure: "danger",
  cancelled: "warning",
};

export function buildImportRowModels(
  rows: readonly ImportLike[],
  now: number = Date.now(),
): readonly ImportRowModel[] {
  return rows.map((r) => ({
    id: r._id,
    source: r.source,
    direction: r.direction,
    statusLabel: r.status,
    statusKind: STATUS_KIND[r.status],
    statsLine: `${r.stats.created} created · ${r.stats.skipped} skipped · ${r.stats.errors} errors`,
    updatedLabel: formatRelativeTime(r.updatedAt, now),
    note: r.note ?? null,
  }));
}
