import { formatRelativeTime } from "../lib/format";

export interface DigestLike {
  readonly _id: string;
  readonly date: string;
  readonly summary: string;
  readonly thoughtCount: number;
  readonly generator: string;
  readonly generatedAt: number;
}

export interface DigestRowModel {
  readonly id: string;
  readonly date: string;
  readonly summary: string;
  readonly countLabel: string;
  readonly generator: string;
  readonly generatedLabel: string;
}

export function buildDigestRowModels(
  rows: readonly DigestLike[],
  now: number = Date.now(),
): readonly DigestRowModel[] {
  return rows.map((r) => ({
    id: r._id,
    date: r.date,
    summary: r.summary,
    countLabel: r.thoughtCount === 1 ? "1 thought" : `${r.thoughtCount} thoughts`,
    generator: r.generator,
    generatedLabel: formatRelativeTime(r.generatedAt, now),
  }));
}
