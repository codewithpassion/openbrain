/**
 * Test fakes for service-layer tests. Mirror the shape used by apps/mcp's
 * helpers but live inside the services package so this package is testable
 * without reaching into a sibling app.
 */
import { createFakeEmbedder, type EmbeddingAdapter } from "@openbrains/ingest";
import type { ThoughtMetadata } from "@openbrains/shared";
import type {
  ConvexCaptureInput,
  ConvexClient,
  ConvexListFilter,
  ConvexRecallInput,
  ConvexReviewInput,
  ConvexThoughtRow,
  ConvexWritebackInput,
  MemoryRecallResponse,
  ThoughtStatsResponse,
  VectorizeBinding,
  VectorizeClient,
} from "../../src/deps/index";
import { ConvexReviewRequiredError, createVectorizeClient } from "../../src/deps/index";

export function emptyMetadata(): ThoughtMetadata {
  return { topics: [], people: [], action_items: [], dates_mentioned: [] };
}

export interface FakeVectorize extends VectorizeBinding {
  readonly upsertCalls: readonly {
    id: string;
    namespace: string;
    values: readonly number[];
    metadata: Record<string, string> | undefined;
  }[];
  readonly queryCalls: readonly {
    namespace: string;
    topK: number;
    filter: Record<string, string> | undefined;
    values: readonly number[];
  }[];
  setMatches(matches: readonly { id: string; score: number }[]): void;
}

export function makeFakeVectorize(): FakeVectorize {
  const upsertCalls: {
    id: string;
    namespace: string;
    values: readonly number[];
    metadata: Record<string, string> | undefined;
  }[] = [];
  const queryCalls: {
    namespace: string;
    topK: number;
    filter: Record<string, string> | undefined;
    values: readonly number[];
  }[] = [];
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
    deleteByIds: () => Promise.resolve(undefined),
  };
  return Object.assign(binding, {
    get upsertCalls() {
      return upsertCalls;
    },
    get queryCalls() {
      return queryCalls;
    },
    setMatches(next: readonly { id: string; score: number }[]) {
      matches = next;
    },
  });
}

type RecallExtras = {
  provenance: MemoryRecallResponse["items"][number]["provenance"];
  usePolicy: MemoryRecallResponse["items"][number]["usePolicy"];
};

export interface FakeConvex extends ConvexClient {
  readonly captureCalls: readonly ConvexCaptureInput[];
  readonly writebackCalls: readonly ConvexWritebackInput[];
  readonly reviewCalls: readonly ConvexReviewInput[];
  readonly listCalls: readonly ConvexListFilter[];
  readonly statsCalls: readonly { userId: string }[];
  readonly getByIdsCalls: readonly { userId: string; ids: readonly string[] }[];
  readonly recallCalls: readonly ConvexRecallInput[];
  seedThought(row: ConvexThoughtRow): void;
  seedFingerprintHit(userId: string, fingerprint: string, thoughtId: string): void;
  seedStats(userId: string, stats: ThoughtStatsResponse): void;
  seedRecallExtras(thoughtId: string, extras: Partial<RecallExtras>): void;
  setReviewResponse(response: { reviewId: string; promoted: boolean } | "REQUIRES_REVIEW"): void;
}

export function makeFakeConvex(): FakeConvex {
  const captureCalls: ConvexCaptureInput[] = [];
  const writebackCalls: ConvexWritebackInput[] = [];
  const reviewCalls: ConvexReviewInput[] = [];
  const listCalls: ConvexListFilter[] = [];
  const statsCalls: { userId: string }[] = [];
  const getByIdsCalls: { userId: string; ids: readonly string[] }[] = [];
  const recallCalls: ConvexRecallInput[] = [];
  const rowsById = new Map<string, ConvexThoughtRow>();
  const fingerprintIndex = new Map<string, string>();
  const statsByUser = new Map<string, ThoughtStatsResponse>();
  const recallExtrasById = new Map<string, RecallExtras>();
  let reviewResponseOverride: { reviewId: string; promoted: boolean } | "REQUIRES_REVIEW" | null =
    null;
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
      if (id === undefined) {
        return Promise.resolve(null);
      }
      const row = rowsById.get(id);
      return Promise.resolve(row ?? null);
    },
    getThoughtsByIds(input) {
      getByIdsCalls.push({ userId: input.userId, ids: input.ids });
      const out: ConvexThoughtRow[] = [];
      for (const id of input.ids) {
        const row = rowsById.get(id);
        if (row !== undefined && row.userId === input.userId) {
          out.push(row);
        }
      }
      return Promise.resolve(out);
    },
    listThoughts(input) {
      listCalls.push({
        userId: input.userId,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.topic === undefined ? {} : { topic: input.topic }),
        ...(input.person === undefined ? {} : { person: input.person }),
        ...(input.days === undefined ? {} : { days: input.days }),
      });
      const all = [...rowsById.values()]
        .filter((r) => r.userId === input.userId)
        .sort((a, b) => b.createdAt - a.createdAt);
      const limited = input.limit === undefined ? all : all.slice(0, input.limit);
      return Promise.resolve(limited);
    },
    thoughtStats(input) {
      statsCalls.push({ userId: input.userId });
      const seeded = statsByUser.get(input.userId);
      if (seeded !== undefined) {
        return Promise.resolve(seeded);
      }
      return Promise.resolve({ total: 0, byType: {}, topTopics: [], topPeople: [] });
    },
    memoryRecall(input) {
      recallCalls.push(input);
      const items: MemoryRecallResponse["items"] = [];
      for (const id of input.thoughtIds) {
        const thought = rowsById.get(id);
        if (thought === undefined || thought.userId !== input.userId) {
          continue;
        }
        const extras = recallExtrasById.get(id);
        items.push({
          thought,
          provenance: extras?.provenance ?? null,
          usePolicy: extras?.usePolicy ?? null,
        });
      }
      return Promise.resolve({ items });
    },
    memoryWriteback(input) {
      writebackCalls.push(input);
      const id = nextId();
      rowsById.set(id, {
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
      });
      return Promise.resolve({ thoughtId: id });
    },
    memoryReview(input) {
      reviewCalls.push(input);
      if (reviewResponseOverride === "REQUIRES_REVIEW") {
        return Promise.reject(new ConvexReviewRequiredError());
      }
      if (reviewResponseOverride !== null) {
        return Promise.resolve(reviewResponseOverride);
      }
      return Promise.resolve({
        reviewId: `r_${input.thoughtId}`,
        promoted: input.promoteTo === "instruction",
      });
    },
  };

  return Object.assign(client, {
    get captureCalls() {
      return captureCalls;
    },
    get writebackCalls() {
      return writebackCalls;
    },
    get reviewCalls() {
      return reviewCalls;
    },
    get listCalls() {
      return listCalls;
    },
    get statsCalls() {
      return statsCalls;
    },
    get getByIdsCalls() {
      return getByIdsCalls;
    },
    get recallCalls() {
      return recallCalls;
    },
    seedThought(row: ConvexThoughtRow) {
      rowsById.set(row._id, row);
      fingerprintIndex.set(`${row.userId}::${row.fingerprint}`, row._id);
    },
    seedFingerprintHit(userId: string, fingerprint: string, thoughtId: string) {
      fingerprintIndex.set(`${userId}::${fingerprint}`, thoughtId);
      if (!rowsById.has(thoughtId)) {
        rowsById.set(thoughtId, {
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
        });
      }
    },
    seedStats(userId: string, stats: ThoughtStatsResponse) {
      statsByUser.set(userId, stats);
    },
    seedRecallExtras(thoughtId: string, extras: Partial<RecallExtras>) {
      const existing = recallExtrasById.get(thoughtId) ?? { provenance: null, usePolicy: null };
      recallExtrasById.set(thoughtId, {
        provenance: extras.provenance ?? existing.provenance,
        usePolicy: extras.usePolicy ?? existing.usePolicy,
      });
    },
    setReviewResponse(response: { reviewId: string; promoted: boolean } | "REQUIRES_REVIEW") {
      reviewResponseOverride = response;
    },
  });
}

export interface ServicesFakeSetup {
  convex: FakeConvex;
  vectorize: VectorizeClient;
  binding: FakeVectorize;
  embeddings: EmbeddingAdapter;
}

export function makeFakeDeps(): ServicesFakeSetup {
  const convex = makeFakeConvex();
  const binding = makeFakeVectorize();
  const vectorize = createVectorizeClient(binding);
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return { convex, vectorize, binding, embeddings };
}
