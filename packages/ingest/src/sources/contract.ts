import type { BrainBundleThought, Importer } from "./types";

export interface ImporterContractInvariants {
  /** Every item the contract pulled out of the importer, in order. */
  readonly items: readonly BrainBundleThought[];
  /** True if `finalize` was called exactly once. */
  readonly finalized: boolean;
  /** The cursor returned by the importer at exhaustion. Must be `null`. */
  readonly terminalCursor: string | null;
}

/**
 * Drive an `Importer` to exhaustion via `begin → nextBatch* → finalize` and
 * surface the invariants the protocol promises. Future real sources (Gmail,
 * Obsidian, ChatGPT, …) can reuse this to prove they satisfy the contract
 * without re-implementing the orchestration in every test.
 */
export async function runImporterContract(
  importer: Importer,
  opts: { resumeCursor?: string; maxBatches?: number } = {},
): Promise<ImporterContractInvariants> {
  const maxBatches = opts.maxBatches ?? 1_000;
  const begin = await importer.begin(
    opts.resumeCursor === undefined ? {} : { resumeCursor: opts.resumeCursor },
  );
  let cursor: string | null = begin.cursor;
  const items: BrainBundleThought[] = [];
  let batches = 0;
  while (cursor !== null) {
    if (batches >= maxBatches) {
      throw new Error(`importer ${importer.source} exceeded maxBatches=${maxBatches.toString()}`);
    }
    const batch = await importer.nextBatch(cursor);
    items.push(...batch.items);
    cursor = batch.nextCursor;
    batches += 1;
    // Empty batch with a non-null cursor would loop forever; the contract
    // forbids it.
    if (batch.items.length === 0 && batch.nextCursor !== null) {
      throw new Error(
        `importer ${importer.source} returned empty batch with non-null cursor — contract violation`,
      );
    }
  }
  await importer.finalize();
  return {
    items,
    finalized: true,
    terminalCursor: cursor,
  };
}
