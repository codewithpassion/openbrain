import {
  type BrainDumpSplitter,
  createFakeBrainDumpSplitter,
  createFakeMetadataExtractor,
  type MetadataExtractor,
  type WorkersAiBinding,
} from "@openbrains/ingest";
import type { ThoughtMetadata } from "@openbrains/shared";
import type {
  ConvexCaptureInput,
  ConvexClient,
  ConvexEntityMentionRow,
  ConvexEntityRelationRow,
  ConvexEntityRelationsInput,
  ConvexEntityRow,
  ConvexGetEntityInput,
  ConvexListEntitiesInput,
  ConvexListFilter,
  ConvexProjectRow,
  ConvexRecallInput,
  ConvexReviewInput,
  ConvexThoughtRow,
  ConvexWritebackInput,
  MemoryRecallResponse,
  ThoughtStatsResponse,
} from "../../src/deps/convex";
import type { VectorizeBinding } from "../../src/env";
import { createSessionScopeStore, type SessionScopeStore } from "../../src/mcp/session-scope-store";

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
  readonly listEntitiesCalls: readonly ConvexListEntitiesInput[];
  readonly getEntityCalls: readonly ConvexGetEntityInput[];
  readonly entityRelationsCalls: readonly ConvexEntityRelationsInput[];
  seedThought(row: ConvexThoughtRow): void;
  seedFingerprintHit(userId: string, fingerprint: string, thoughtId: string): void;
  seedStats(userId: string, stats: ThoughtStatsResponse): void;
  /** Attach optional provenance/use-policy returned by `memoryRecall` for an id. */
  seedRecallExtras(thoughtId: string, extras: Partial<RecallExtras>): void;
  /** Override the review response (default `{ reviewId, promoted: promoteTo === "instruction" }`). */
  setReviewResponse(response: { reviewId: string; promoted: boolean }): void;
  seedEntity(row: ConvexEntityRow): void;
  seedEntityMention(row: ConvexEntityMentionRow): void;
  seedEntityRelation(row: ConvexEntityRelationRow): void;
  seedProject(row: ConvexProjectRow): void;
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
  const fingerprintIndex = new Map<string, string>(); // `${userId}::${fp}` -> thoughtId
  const statsByUser = new Map<string, ThoughtStatsResponse>();
  const recallExtrasById = new Map<string, RecallExtras>();
  const entitiesById = new Map<string, ConvexEntityRow>();
  const entityMentions: ConvexEntityMentionRow[] = [];
  const entityRelations: ConvexEntityRelationRow[] = [];
  const listEntitiesCalls: ConvexListEntitiesInput[] = [];
  const getEntityCalls: ConvexGetEntityInput[] = [];
  const entityRelationsCalls: ConvexEntityRelationsInput[] = [];
  const projectsList: ConvexProjectRow[] = [];
  let reviewResponseOverride: { reviewId: string; promoted: boolean } | null = null;
  let idCounter = 0;
  function nextId(): string {
    idCounter += 1;
    return `t_${idCounter.toString().padStart(6, "0")}`;
  }

  const client: ConvexClient = {
    updateThought(input) {
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
      };
      rowsById.set(input.thoughtId, updated);
      const updScopeKey = updated.scope ?? "";
      fingerprintIndex.set(
        `${input.userId}::${updScopeKey}::${input.fingerprint}`,
        input.thoughtId,
      );
      return Promise.resolve();
    },
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
      const matched = all.filter((row) => matchesFilters(row, input));
      const limited = input.limit === undefined ? matched : matched.slice(0, input.limit);
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
      return Promise.resolve({ thoughtId: id });
    },
    memoryReview(input) {
      reviewCalls.push(input);
      if (reviewResponseOverride !== null) {
        return Promise.resolve(reviewResponseOverride);
      }
      return Promise.resolve({
        reviewId: `r_${input.thoughtId}`,
        promoted: input.promoteTo === "instruction",
      });
    },
    listEntities(input) {
      listEntitiesCalls.push({
        userId: input.userId,
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      });
      let rows = [...entitiesById.values()]
        .filter((e) => e.userId === input.userId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      if (input.kind !== undefined) {
        rows = rows.filter((e) => e.kind === input.kind);
      }
      const limit = input.limit ?? 100;
      return Promise.resolve(rows.slice(0, limit));
    },
    getEntity(input) {
      getEntityCalls.push({
        userId: input.userId,
        entityId: input.entityId,
        ...(input.mentionsLimit === undefined ? {} : { mentionsLimit: input.mentionsLimit }),
      });
      const entity = entitiesById.get(input.entityId);
      if (entity === undefined || entity.userId !== input.userId) {
        return Promise.resolve({ entity: null, mentions: [] });
      }
      const limit = input.mentionsLimit ?? 50;
      const mentions = entityMentions
        .filter((m) => m.userId === input.userId && m.entityId === input.entityId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
      return Promise.resolve({ entity, mentions });
    },
    entityRelations(input) {
      entityRelationsCalls.push({
        userId: input.userId,
        entityId: input.entityId,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      });
      const entity = entitiesById.get(input.entityId);
      if (entity === undefined || entity.userId !== input.userId) {
        return Promise.resolve({ outgoing: [], incoming: [] });
      }
      const limit = input.limit ?? 100;
      const outgoing = entityRelations
        .filter((r) => r.userId === input.userId && r.fromEntityId === input.entityId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
      const incoming = entityRelations
        .filter((r) => r.userId === input.userId && r.toEntityId === input.entityId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
      return Promise.resolve({ outgoing, incoming });
    },
    listProjects(input) {
      return Promise.resolve(projectsList.filter((p) => p.userId === input.userId));
    },
    createProject(input) {
      if (projectsList.some((p) => p.userId === input.userId && p.slug === input.slug)) {
        return Promise.reject(new Error("SLUG_TAKEN"));
      }
      const id = `p_${(projectsList.length + 1).toString().padStart(6, "0")}`;
      const row: ConvexProjectRow = {
        _id: id,
        userId: input.userId,
        slug: input.slug,
        name: input.name,
        createdAt: Date.now(),
        ...(input.description === undefined ? {} : { description: input.description }),
      };
      projectsList.push(row);
      return Promise.resolve({ id, slug: input.slug });
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
    get listCalls(): readonly ConvexListFilter[] {
      return listCalls;
    },
    get statsCalls(): readonly { userId: string }[] {
      return statsCalls;
    },
    get getByIdsCalls(): readonly { userId: string; ids: readonly string[] }[] {
      return getByIdsCalls;
    },
    get recallCalls(): readonly ConvexRecallInput[] {
      return recallCalls;
    },
    seedThought(row: ConvexThoughtRow): void {
      rowsById.set(row._id, row);
      const scopeKey = row.scope ?? "";
      fingerprintIndex.set(`${row.userId}::${scopeKey}::${row.fingerprint}`, row._id);
    },
    seedProject(row: ConvexProjectRow): void {
      projectsList.push(row);
    },
    seedFingerprintHit(userId: string, fingerprint: string, thoughtId: string): void {
      fingerprintIndex.set(`${userId}::::${fingerprint}`, thoughtId);
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
    seedStats(userId: string, stats: ThoughtStatsResponse): void {
      statsByUser.set(userId, stats);
    },
    seedRecallExtras(thoughtId: string, extras: Partial<RecallExtras>): void {
      const existing = recallExtrasById.get(thoughtId) ?? { provenance: null, usePolicy: null };
      recallExtrasById.set(thoughtId, {
        provenance: extras.provenance ?? existing.provenance,
        usePolicy: extras.usePolicy ?? existing.usePolicy,
      });
    },
    setReviewResponse(response: { reviewId: string; promoted: boolean }): void {
      reviewResponseOverride = response;
    },
    get listEntitiesCalls(): readonly ConvexListEntitiesInput[] {
      return listEntitiesCalls;
    },
    get getEntityCalls(): readonly ConvexGetEntityInput[] {
      return getEntityCalls;
    },
    get entityRelationsCalls(): readonly ConvexEntityRelationsInput[] {
      return entityRelationsCalls;
    },
    seedEntity(row: ConvexEntityRow): void {
      entitiesById.set(row._id, row);
    },
    seedEntityMention(row: ConvexEntityMentionRow): void {
      entityMentions.push(row);
    },
    seedEntityRelation(row: ConvexEntityRelationRow): void {
      entityRelations.push(row);
    },
  });
}

function matchesFilters(row: ConvexThoughtRow, input: ConvexListFilter): boolean {
  if (input.type !== undefined && row.metadata.type !== input.type) {
    return false;
  }
  if (input.topic !== undefined && !row.metadata.topics.includes(input.topic)) {
    return false;
  }
  if (input.person !== undefined && !row.metadata.people.includes(input.person)) {
    return false;
  }
  if (input.days !== undefined) {
    const cutoff = Date.now() - input.days * 24 * 60 * 60 * 1000;
    if (row.createdAt < cutoff) {
      return false;
    }
  }
  return true;
}

/**
 * Default LLM-adapter fakes for `ToolDeps`. Spread into a deps object alongside
 * convex/vectorize/embeddings. Tests that exercise the LLM tools override with
 * a programmable extractor.
 *
 * Also wires up an in-memory `sessionScope` store so handlers that read the
 * pinned default see an empty/no-default state by default; tests that exercise
 * the session-scope path can seed `defaults.sessionScope.set(userId, "slug")`
 * after the call.
 */
export function defaultExtras(): {
  metadata: MetadataExtractor;
  splitter: BrainDumpSplitter;
  sessionScope: SessionScopeStore;
} {
  return {
    metadata: createFakeMetadataExtractor(),
    splitter: createFakeBrainDumpSplitter(),
    sessionScope: createSessionScopeStore(makeFakeKV()),
  };
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
