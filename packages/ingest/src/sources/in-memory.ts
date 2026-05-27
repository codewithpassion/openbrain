import type { BrainBundleThought, Importer } from "./types";

/**
 * In-memory `Importer` for tests and contract-validation. Produces a fixed
 * list of thoughts in deterministic batches, optionally resumable via
 * `resumeCursor`.
 *
 * Lives in the `ingest` package so future real sources (Gmail, Obsidian, …)
 * can be tested against the same contract by swapping this fixture in.
 */
export function createInMemoryImporter(opts: {
  source: string;
  items: readonly BrainBundleThought[];
  batchSize?: number;
}): Importer & { readonly finalized: () => boolean } {
  const batchSize = opts.batchSize ?? 2;
  const items = [...opts.items];
  let position = 0;
  let finalized = false;

  function cursorFor(pos: number): string | null {
    if (pos >= items.length) {
      return null;
    }
    return `pos:${pos.toString()}`;
  }

  function parseCursor(cursor: string | null): number {
    if (cursor === null) {
      return position;
    }
    const m = /^pos:(\d+)$/.exec(cursor);
    if (m === null) {
      return 0;
    }
    return Number.parseInt(m[1] ?? "0", 10);
  }

  return {
    source: opts.source,
    begin: ({ resumeCursor }: { resumeCursor?: string }) => {
      position = resumeCursor === undefined ? 0 : parseCursor(resumeCursor);
      return Promise.resolve({ cursor: cursorFor(position) });
    },
    nextBatch: (cursor: string | null) => {
      const start = cursor === null ? position : parseCursor(cursor);
      const end = Math.min(start + batchSize, items.length);
      const slice = items.slice(start, end);
      position = end;
      return Promise.resolve({ items: slice, nextCursor: cursorFor(end) });
    },
    finalize: () => {
      finalized = true;
      return Promise.resolve();
    },
    finalized: () => finalized,
  };
}
