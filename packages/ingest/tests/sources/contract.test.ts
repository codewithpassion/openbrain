import { describe, expect, test } from "bun:test";
import {
  type BrainBundleThought,
  createInMemoryImporter,
  runImporterContract,
} from "../../src/sources";

function makeThought(id: string, content: string): BrainBundleThought {
  return {
    id,
    content,
    source: "test",
    embeddingModel: "fake",
    embeddingDims: 1024,
    fingerprint: id.padEnd(64, "0"),
    createdAt: 1_700_000_000_000,
    metadata: {
      topics: [],
      people: [],
      action_items: [],
      dates_mentioned: [],
    },
  };
}

describe("Importer contract", () => {
  test("drives a source to exhaustion through begin → nextBatch* → finalize", async () => {
    const items = [
      makeThought("t1", "alpha"),
      makeThought("t2", "beta"),
      makeThought("t3", "gamma"),
    ];
    const importer = createInMemoryImporter({ source: "test:in-memory", items, batchSize: 2 });
    const out = await runImporterContract(importer);
    expect(out.items.map((i) => i.id)).toEqual(["t1", "t2", "t3"]);
    expect(out.finalized).toBe(true);
    expect(out.terminalCursor).toBeNull();
    expect(importer.finalized()).toBe(true);
  });

  test("an empty source still calls finalize exactly once", async () => {
    const importer = createInMemoryImporter({ source: "empty", items: [], batchSize: 2 });
    const out = await runImporterContract(importer);
    expect(out.items).toHaveLength(0);
    expect(out.finalized).toBe(true);
    expect(importer.finalized()).toBe(true);
  });

  test("resumeCursor honors prior progress", async () => {
    const items = [
      makeThought("t1", "alpha"),
      makeThought("t2", "beta"),
      makeThought("t3", "gamma"),
      makeThought("t4", "delta"),
    ];
    const importer = createInMemoryImporter({ source: "resumable", items, batchSize: 2 });
    const out = await runImporterContract(importer, { resumeCursor: "pos:2" });
    expect(out.items.map((i) => i.id)).toEqual(["t3", "t4"]);
  });

  test("contract aborts an importer that loops with an empty batch + non-null cursor", async () => {
    const broken = {
      source: "broken",
      begin: () => Promise.resolve({ cursor: "start" }),
      nextBatch: () => Promise.resolve({ items: [], nextCursor: "still-going" }),
      finalize: () => Promise.resolve(),
    };
    await expect(runImporterContract(broken, { maxBatches: 5 })).rejects.toThrow(
      /contract violation/,
    );
  });
});
