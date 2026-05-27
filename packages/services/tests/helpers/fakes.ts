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
  ConvexProjectRow,
  ConvexRecallInput,
  ConvexReviewInput,
  ConvexThoughtRow,
  ConvexUpdateInput,
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
  readonly updateCalls: readonly ConvexUpdateInput[];
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
  const updateCalls: ConvexUpdateInput[] = [];
  const rowsById = new Map<string, ConvexThoughtRow>();
  const fingerprintIndex = new Map<string, string>();
  const statsByUser = new Map<string, ThoughtStatsResponse>();
  const recallExtrasById = new Map<string, RecallExtras>();
  const projects: ConvexProjectRow[] = [];
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
      const scopeKey = input.scope ?? "";
      fingerprintIndex.set(`${input.userId}::${scopeKey}::${input.fingerprint}`, id);
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
        ...(input.scope === undefined ? {} : { scope: input.scope }),
      };
      rowsById.set(id, row);
      return Promise.resolve({ id });
    },
    updateThought(input) {
      updateCalls.push(input);
      const row = rowsById.get(input.thoughtId);
      if (row === undefined || row.userId !== input.userId) {
        return Promise.reject(new Error("thought not found"));
      }
      const updated: ConvexThoughtRow = {
        ...row,
        content: input.content,
        fingerprint: input.fingerprint,
        metadata: input.metadata,
        updatedAt: Date.now(),
        ...(input.embeddingModel === undefined ? {} : { embeddingModel: input.embeddingModel }),
        ...(input.embeddingDims === undefined ? {} : { embeddingDims: input.embeddingDims }),
      };
      rowsById.set(input.thoughtId, updated);
      const updScopeKey = updated.scope ?? "";
      fingerprintIndex.set(
        `${input.userId}::${updScopeKey}::${input.fingerprint}`,
        input.thoughtId,
      );
      return Promise.resolve();
    },
    getByFingerprint(input) {
      const scopeKey = input.scope ?? "";
      const id = fingerprintIndex.get(`${input.userId}::${scopeKey}::${input.fingerprint}`);
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
        ...(input.scope === undefined ? {} : { scope: input.scope }),
      });
      const all = [...rowsById.values()]
        .filter((r) => r.userId === input.userId)
        .filter((r) => input.scope === undefined || r.scope === input.scope)
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
    setThoughtType(input) {
      const row = rowsById.get(input.thoughtId);
      if (row === undefined || row.userId !== input.userId) {
        return Promise.resolve({ wrote: false });
      }
      if (row.metadata.type !== undefined) {
        return Promise.resolve({ wrote: false });
      }
      rowsById.set(input.thoughtId, {
        ...row,
        metadata: {
          ...row.metadata,
          type: input.type as ConvexThoughtRow["metadata"]["type"],
        },
        updatedAt: Date.now(),
      });
      return Promise.resolve({ wrote: true });
    },
    mergeThoughtMetadata(input) {
      const row = rowsById.get(input.thoughtId);
      if (row === undefined || row.userId !== input.userId) {
        return Promise.reject(new Error("thought not found"));
      }
      rowsById.set(input.thoughtId, {
        ...row,
        metadata: input.metadata,
        updatedAt: Date.now(),
      });
      return Promise.resolve();
    },
    persistSplit(input) {
      const parent = rowsById.get(input.parentThoughtId);
      if (parent === undefined || parent.userId !== input.userId) {
        return Promise.reject(new Error("parent thought not found"));
      }
      const childIds: string[] = [];
      for (const idea of input.ideas) {
        const id = nextId();
        rowsById.set(id, {
          _id: id,
          userId: input.userId,
          content: idea.content,
          source: `split:${parent.source}`,
          embeddingModel: parent.embeddingModel,
          embeddingDims: parent.embeddingDims,
          fingerprint: `${parent._id}-${idea.content}`.padEnd(64, "0").slice(0, 64),
          metadata: {
            ...(idea.type === undefined
              ? {}
              : { type: idea.type as ConvexThoughtRow["metadata"]["type"] }),
            topics: [...idea.topics],
            people: [],
            action_items: [],
            dates_mentioned: [],
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        childIds.push(id);
      }
      return Promise.resolve({ created: childIds.length, childIds });
    },
    listEntities() {
      return Promise.resolve([]);
    },
    getEntity() {
      return Promise.resolve({ entity: null, mentions: [] });
    },
    entityRelations() {
      return Promise.resolve({ outgoing: [], incoming: [] });
    },
    listProjects(input) {
      const out = projects.filter((p) => p.userId === input.userId);
      return Promise.resolve(out);
    },
    createProject(input) {
      if (projects.some((p) => p.userId === input.userId && p.slug === input.slug)) {
        return Promise.reject(new Error("SLUG_TAKEN"));
      }
      const id = `p_${(projects.length + 1).toString().padStart(6, "0")}`;
      const row: ConvexProjectRow = {
        _id: id,
        userId: input.userId,
        slug: input.slug,
        name: input.name,
        createdAt: Date.now(),
        ...(input.description === undefined ? {} : { description: input.description }),
      };
      projects.push(row);
      return Promise.resolve({ id, slug: input.slug });
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
    get updateCalls() {
      return updateCalls;
    },
    seedThought(row: ConvexThoughtRow) {
      rowsById.set(row._id, row);
      const scopeKey = row.scope ?? "";
      fingerprintIndex.set(`${row.userId}::${scopeKey}::${row.fingerprint}`, row._id);
    },
    seedFingerprintHit(userId: string, fingerprint: string, thoughtId: string) {
      // Test helper: seeds against the unscoped namespace by default. Tests
      // that need scoped seeding should `seedThought` with a `scope` field.
      fingerprintIndex.set(`${userId}::::${fingerprint}`, thoughtId);
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
