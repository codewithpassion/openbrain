import type { VectorizeBinding } from "../env";

/**
 * Narrow Vectorize client our tools call. Namespace is always `userId` — this
 * is the primary tenant-isolation gate (ARCHITECTURE.md §"Vectorize index").
 * Tests assert the namespace is wired through on every call.
 */
export interface VectorizeClient {
  upsert(input: {
    id: string;
    userId: string;
    values: readonly number[];
    metadata: { type?: string; source: string };
  }): Promise<void>;
  query(input: {
    userId: string;
    values: readonly number[];
    topK: number;
    metadata?: { type?: string; source?: string };
  }): Promise<readonly { id: string; score: number }[]>;
  delete(input: { id: string }): Promise<void>;
}

export function createVectorizeClient(binding: VectorizeBinding): VectorizeClient {
  async function upsert(input: {
    id: string;
    userId: string;
    values: readonly number[];
    metadata: { type?: string; source: string };
  }): Promise<void> {
    const meta: Record<string, string> = { source: input.metadata.source };
    if (input.metadata.type !== undefined) {
      meta["type"] = input.metadata.type;
    }
    await binding.upsert([
      {
        id: input.id,
        values: input.values,
        namespace: input.userId,
        metadata: meta,
      },
    ]);
  }

  async function query(input: {
    userId: string;
    values: readonly number[];
    topK: number;
    metadata?: { type?: string; source?: string };
  }): Promise<readonly { id: string; score: number }[]> {
    const filter: Record<string, string> = {};
    if (input.metadata?.type !== undefined) {
      filter["type"] = input.metadata.type;
    }
    if (input.metadata?.source !== undefined) {
      filter["source"] = input.metadata.source;
    }
    const opts: {
      topK: number;
      namespace: string;
      filter?: Record<string, string>;
    } = { topK: input.topK, namespace: input.userId };
    if (Object.keys(filter).length > 0) {
      opts.filter = filter;
    }
    const res = await binding.query(input.values, opts);
    return res.matches.map((m) => ({ id: m.id, score: m.score }));
  }

  async function deleteOne(input: { id: string }): Promise<void> {
    await binding.deleteByIds([input.id]);
  }

  return { upsert, query, delete: deleteOne };
}
