import { formatRelativeTime } from "../lib/format";

export interface EntityLike {
  readonly _id: string;
  readonly kind: string;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly updatedAt: number;
}

export interface EntityRowModel {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly aliasesLine: string;
  readonly updatedLabel: string;
}

export function buildEntityRowModels(
  rows: readonly EntityLike[],
  now: number = Date.now(),
): readonly EntityRowModel[] {
  return rows.map((r) => ({
    id: r._id,
    name: r.canonicalName,
    kind: r.kind,
    aliasesLine: r.aliases.length === 0 ? "" : `also: ${r.aliases.slice(0, 5).join(", ")}`,
    updatedLabel: formatRelativeTime(r.updatedAt, now),
  }));
}

export function groupByKind(
  rows: readonly EntityRowModel[],
): readonly { readonly kind: string; readonly entities: readonly EntityRowModel[] }[] {
  const groups = new Map<string, EntityRowModel[]>();
  for (const r of rows) {
    const arr = groups.get(r.kind) ?? [];
    arr.push(r);
    groups.set(r.kind, arr);
  }
  return [...groups.entries()]
    .map(([kind, entities]) => ({ kind, entities }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}
