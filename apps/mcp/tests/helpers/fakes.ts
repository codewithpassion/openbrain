import type { WorkersAiBinding } from "@openbrains/ingest";
import type { ThoughtMetadata } from "@openbrains/shared";
import type {
  ConvexCaptureInput,
  ConvexClient,
  ConvexReviewInput,
  ConvexThoughtRow,
  ConvexWritebackInput,
} from "../../src/deps/convex";
import type { VectorizeBinding } from "../../src/env";

/* -------------------------------------------------------------------------- */
/* FakeAi                                                                     */
/* -------------------------------------------------------------------------- */

export interface FakeAiCall {
  model: string;
  text: readonly string[];
}

export interface FakeAi extends WorkersAiBinding {
  readonly calls: readonly FakeAiCall[];
}

export function makeFakeAi(opts?: { dimensions?: number }): FakeAi {
  const dimensions = opts?.dimensions ?? 1024;
  const calls: FakeAiCall[] = [];
  const binding: WorkersAiBinding = {
    run: (model, input) => {
      calls.push({ model, text: input.text });
      const data = input.text.map((t) => seedVector(t, dimensions));
      return Promise.resolve({ data });
    },
  };
  return Object.assign(binding, {
    get calls(): readonly FakeAiCall[] {
      return calls;
    },
  });
}

function seedVector(text: string, dims: number): readonly number[] {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  const out = new Array<number>(dims);
  for (let i = 0; i < dims; i += 1) {
    h = (h * 1_103_515_245 + 12_345) | 0;
    out[i] = ((h >>> 0) % 2_000) / 2_000 - 0.5;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* FakeVectorize                                                              */
/* -------------------------------------------------------------------------- */

export interface VectorizeUpsertCall {
  id: string;
  namespace: string;
  values: readonly number[];
  metadata: Record<string, string> | undefined;
}

export interface VectorizeQueryCall {
  namespace: string;
  topK: number;
  filter: Record<string, string> | undefined;
  values: readonly number[];
}

export interface VectorizeDeleteCall {
  ids: readonly string[];
}

export interface FakeVectorize extends VectorizeBinding {
  readonly upsertCalls: readonly VectorizeUpsertCall[];
  readonly queryCalls: readonly VectorizeQueryCall[];
  readonly deleteCalls: readonly VectorizeDeleteCall[];
  /** Programmable query response. */
  setMatches(matches: readonly { id: string; score: number }[]): void;
}

export function makeFakeVectorize(): FakeVectorize {
  const upsertCalls: VectorizeUpsertCall[] = [];
  const queryCalls: VectorizeQueryCall[] = [];
  const deleteCalls: VectorizeDeleteCall[] = [];
  let matches: readonly { id: string; score: number }[] = [];

  const binding: VectorizeBinding = {
    upsert: (vectors) => {
      for (const v of vectors) {
        upsertCalls.push({
          id: v.id,
          namespace: v.namespace,
          values: v.values,
          metadata: v.metadata,
        });
      }
      return Promise.resolve(undefined);
    },
    query: (values, options) => {
      queryCalls.push({
        namespace: options.namespace,
        topK: options.topK,
        filter: options.filter,
        values,
      });
      return Promise.resolve({ matches });
    },
    deleteByIds: (ids) => {
      deleteCalls.push({ ids });
      return Promise.resolve(undefined);
    },
  };

  return Object.assign(binding, {
    get upsertCalls(): readonly VectorizeUpsertCall[] {
      return upsertCalls;
    },
    get queryCalls(): readonly VectorizeQueryCall[] {
      return queryCalls;
    },
    get deleteCalls(): readonly VectorizeDeleteCall[] {
      return deleteCalls;
    },
    setMatches(next: readonly { id: string; score: number }[]): void {
      matches = next;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* FakeConvex                                                                 */
/* -------------------------------------------------------------------------- */

export interface FakeConvex extends ConvexClient {
  readonly captureCalls: readonly ConvexCaptureInput[];
  readonly writebackCalls: readonly ConvexWritebackInput[];
  readonly reviewCalls: readonly ConvexReviewInput[];
  readonly listCalls: readonly { userId: string; limit?: number }[];
  readonly statsCalls: readonly { userId: string }[];
  readonly getByIdsCalls: readonly { userId: string; ids: readonly string[] }[];
  seedThought(row: ConvexThoughtRow): void;
  seedFingerprintHit(userId: string, fingerprint: string, thoughtId: string): void;
  seedStats(
    userId: string,
    stats: {
      total: number;
      byType: Record<string, number>;
      topTopics: readonly { topic: string; count: number }[];
    },
  ): void;
}

export function makeFakeConvex(): FakeConvex {
  const captureCalls: ConvexCaptureInput[] = [];
  const writebackCalls: ConvexWritebackInput[] = [];
  const reviewCalls: ConvexReviewInput[] = [];
  const listCalls: { userId: string; limit?: number }[] = [];
  const statsCalls: { userId: string }[] = [];
  const getByIdsCalls: { userId: string; ids: readonly string[] }[] = [];
  const rowsById = new Map<string, ConvexThoughtRow>();
  const fingerprintIndex = new Map<string, string>(); // `${userId}::${fp}` -> thoughtId
  const statsByUser = new Map<
    string,
    {
      total: number;
      byType: Record<string, number>;
      topTopics: readonly { topic: string; count: number }[];
    }
  >();
  let idCounter = 0;
  function nextId(): string {
    idCounter += 1;
    return `t_${idCounter.toString().padStart(6, "0")}`;
  }

  const client: ConvexClient = {
    captureThought(input) {
      captureCalls.push(input);
      const id = nextId();
      fingerprintIndex.set(`${input.userId}::${input.fingerprint}`, id);
      const row: ConvexThoughtRow = {
        _id: id,
        userId: input.userId,
        content: input.content,
        source: input.source,
        embeddingModel: input.embeddingModel,
        embeddingDims: input.embeddingDims,
        fingerprint: input.fingerprint,
        metadata: input.metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      rowsById.set(id, row);
      return Promise.resolve({ id });
    },
    getByFingerprint(input) {
      const id = fingerprintIndex.get(`${input.userId}::${input.fingerprint}`);
      return Promise.resolve(id === undefined ? null : { id });
    },
    getThoughtsByIds(input) {
      getByIdsCalls.push({ userId: input.userId, ids: input.ids });
      const rows: ConvexThoughtRow[] = [];
      for (const id of input.ids) {
        const row = rowsById.get(id);
        if (row !== undefined && row.userId === input.userId) {
          rows.push(row);
        }
      }
      return Promise.resolve(rows);
    },
    listThoughts(input) {
      listCalls.push({
        userId: input.userId,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      });
      const rows = [...rowsById.values()]
        .filter((r) => r.userId === input.userId)
        .sort((a, b) => b.createdAt - a.createdAt);
      const limited = input.limit === undefined ? rows : rows.slice(0, input.limit);
      return Promise.resolve(limited);
    },
    thoughtStats(input) {
      statsCalls.push({ userId: input.userId });
      const seeded = statsByUser.get(input.userId);
      if (seeded !== undefined) {
        return Promise.resolve(seeded);
      }
      return Promise.resolve({ total: 0, byType: {}, topTopics: [] });
    },
    memoryWriteback(input) {
      writebackCalls.push(input);
      const id = nextId();
      const row: ConvexThoughtRow = {
        _id: id,
        userId: input.userId,
        content: input.content,
        source: input.source,
        embeddingModel: input.embeddingModel,
        embeddingDims: input.embeddingDims,
        fingerprint: input.fingerprint,
        metadata: input.metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      rowsById.set(id, row);
      return Promise.resolve({ id });
    },
    memoryReview(input) {
      reviewCalls.push(input);
      return Promise.resolve({ id: `r_${input.thoughtId}` });
    },
  };

  return Object.assign(client, {
    get captureCalls(): readonly ConvexCaptureInput[] {
      return captureCalls;
    },
    get writebackCalls(): readonly ConvexWritebackInput[] {
      return writebackCalls;
    },
    get reviewCalls(): readonly ConvexReviewInput[] {
      return reviewCalls;
    },
    get listCalls(): readonly { userId: string; limit?: number }[] {
      return listCalls;
    },
    get statsCalls(): readonly { userId: string }[] {
      return statsCalls;
    },
    get getByIdsCalls(): readonly { userId: string; ids: readonly string[] }[] {
      return getByIdsCalls;
    },
    seedThought(row: ConvexThoughtRow): void {
      rowsById.set(row._id, row);
      fingerprintIndex.set(`${row.userId}::${row.fingerprint}`, row._id);
    },
    seedFingerprintHit(userId: string, fingerprint: string, thoughtId: string): void {
      fingerprintIndex.set(`${userId}::${fingerprint}`, thoughtId);
      if (!rowsById.has(thoughtId)) {
        const row: ConvexThoughtRow = {
          _id: thoughtId,
          userId,
          content: "<seeded>",
          source: "seed",
          embeddingModel: "fake",
          embeddingDims: 1024,
          fingerprint,
          metadata: emptyMetadata(),
          createdAt: 1,
          updatedAt: 1,
        };
        rowsById.set(thoughtId, row);
      }
    },
    seedStats(
      userId: string,
      stats: {
        total: number;
        byType: Record<string, number>;
        topTopics: readonly { topic: string; count: number }[];
      },
    ): void {
      statsByUser.set(userId, stats);
    },
  });
}

export function emptyMetadata(): ThoughtMetadata {
  return {
    topics: [],
    people: [],
    action_items: [],
    dates_mentioned: [],
  };
}

/* -------------------------------------------------------------------------- */
/* FakeOAuthKV                                                                */
/* -------------------------------------------------------------------------- */

export interface FakeKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export function makeFakeKV(): FakeKV {
  const store = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(store.get(key) ?? null),
    put: (key, value) => {
      store.set(key, value);
      return Promise.resolve(undefined);
    },
    delete: (key) => {
      store.delete(key);
      return Promise.resolve(undefined);
    },
  };
}
