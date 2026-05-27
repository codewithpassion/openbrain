/**
 * Narrow Vectorize binding surface that we actually call. We declare a tiny
 * structural type rather than pulling the full `Vectorize` interface from
 * `@cloudflare/workers-types`; this keeps the shape testable with plain fakes
 * (per CLAUDE.md §2 "narrow ambient type" pattern).
 */
export interface VectorizeBinding {
  upsert(
    vectors: readonly {
      id: string;
      values: readonly number[];
      namespace: string;
      metadata?: Record<string, string>;
    }[],
  ): Promise<unknown>;
  query(
    values: readonly number[],
    options: {
      topK: number;
      namespace: string;
      filter?: Record<string, string>;
      returnValues?: boolean;
      returnMetadata?: boolean | "all" | "indexed";
    },
  ): Promise<{ matches: readonly { id: string; score: number }[] }>;
  deleteByIds(ids: readonly string[]): Promise<unknown>;
}

/**
 * Narrow Vectorize client our services call. Namespace is always `userId` —
 * this is the primary tenant-isolation gate (ARCHITECTURE.md §"Vectorize index").
 * Tests assert the namespace is wired through on every call.
 *
 * `scope` (Phase H) is carried in vector metadata so semantic search can push
 * the filter into Vectorize once the operator has created the metadata index:
 *   `wrangler vectorize create-metadata-index thoughts-v1 --property-name=scope --type=string`
 * Callers still re-check `scope` against the Convex row — Vectorize metadata
 * can lag writes, so the Convex value is the correctness gate.
 */
export interface VectorizeClient {
  upsert(input: {
    id: string;
    userId: string;
    values: readonly number[];
    metadata: { type?: string; source: string; scope?: string };
  }): Promise<void>;
  query(input: {
    userId: string;
    values: readonly number[];
    topK: number;
    metadata?: { type?: string; source?: string; scope?: string };
  }): Promise<readonly { id: string; score: number }[]>;
  delete(input: { id: string }): Promise<void>;
}

export function createVectorizeClient(binding: VectorizeBinding): VectorizeClient {
  async function upsert(input: {
    id: string;
    userId: string;
    values: readonly number[];
    metadata: { type?: string; source: string; scope?: string };
  }): Promise<void> {
    const meta: Record<string, string> = { source: input.metadata.source };
    if (input.metadata.type !== undefined) {
      meta["type"] = input.metadata.type;
    }
    if (input.metadata.scope !== undefined) {
      meta["scope"] = input.metadata.scope;
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
    metadata?: { type?: string; source?: string; scope?: string };
  }): Promise<readonly { id: string; score: number }[]> {
    const filter: Record<string, string> = {};
    if (input.metadata?.type !== undefined) {
      filter["type"] = input.metadata.type;
    }
    if (input.metadata?.source !== undefined) {
      filter["source"] = input.metadata.source;
    }
    if (input.metadata?.scope !== undefined) {
      filter["scope"] = input.metadata.scope;
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
