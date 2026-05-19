/**
 * Convex HTTP client wrapper. Every call sets the two trust-boundary headers
 * defined in `packages/convex/convex/http.ts`:
 *
 *   X-OpenBrains-Internal-Secret  — the shared secret matching INTERNAL_API_SECRET
 *   X-OpenBrains-User-Id          — the Clerk userId the Worker resolved from
 *                                   the OAuth token
 *
 * The Convex side trusts these headers and dispatches to internal mutations
 * that take `userId` as a parameter. The Worker is therefore the sole point
 * where userId attribution is decided — see CLAUDE.md §"Patterns".
 *
 * Every parsed response goes through a Zod schema in
 * `./convex-schemas.ts` before crossing this function boundary. The raw
 * `fetch` call below is the only untyped escape hatch.
 */

import type { MemoryOrigin, ThoughtMetadata } from "@openbrains/shared";
import type { z } from "zod";
import {
  ByFingerprintResponseSchema,
  CaptureResponseSchema,
  type ConvexEntityMentionRow,
  type ConvexEntityRelationRow,
  type ConvexEntityRow,
  type ConvexThoughtRow,
  EntityGetResponseSchema,
  EntityListResponseSchema,
  EntityRelationsResponseSchema,
  type MemoryRecallResponse,
  MemoryRecallResponseSchema,
  type MemoryReviewStatus,
  ReviewRequiresReviewErrorSchema,
  type ReviewResponse,
  ReviewResponseSchema,
  ThoughtRowsResponseSchema,
  type ThoughtStatsResponse,
  ThoughtStatsResponseSchema,
  WritebackResponseSchema,
} from "./convex-schemas";

export type {
  ConvexEntityMentionRow,
  ConvexEntityRelationRow,
  ConvexEntityRow,
  ConvexThoughtRow,
  MemoryRecallResponse,
  ReviewResponse,
  ThoughtStatsResponse,
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ConvexCaptureInput {
  userId: string;
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: ThoughtMetadata;
}

export interface ConvexWritebackProvenance {
  origin: MemoryOrigin;
  agent?: string;
  agentVersion?: string;
  sessionId?: string;
}

export interface ConvexWritebackInput {
  userId: string;
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: ThoughtMetadata;
  provenance: ConvexWritebackProvenance;
  scopes?: readonly string[];
  vectorizeId?: string;
}

export interface ConvexReviewInput {
  userId: string;
  thoughtId: string;
  status: MemoryReviewStatus;
  promoteTo?: "instruction";
  note?: string;
}

export interface ConvexListFilter {
  userId: string;
  limit?: number;
  type?: string;
  topic?: string;
  person?: string;
  days?: number;
}

export interface ConvexRecallInput {
  userId: string;
  thoughtIds: readonly string[];
  query?: string;
  scores?: readonly number[];
}

export interface ConvexListEntitiesInput {
  userId: string;
  kind?: string;
  limit?: number;
}

export interface ConvexGetEntityInput {
  userId: string;
  entityId: string;
  mentionsLimit?: number;
}

export interface ConvexEntityRelationsInput {
  userId: string;
  entityId: string;
  limit?: number;
}

export interface ConvexClient {
  captureThought(input: ConvexCaptureInput): Promise<{ id: string }>;
  /**
   * Returns the existing thought row for `(userId, fingerprint)` if any, or
   * `null` if none. Used by `capture-thought` to satisfy the idempotency
   * requirement.
   */
  getByFingerprint(input: {
    userId: string;
    fingerprint: string;
  }): Promise<ConvexThoughtRow | null>;
  getThoughtsByIds(input: {
    userId: string;
    ids: readonly string[];
  }): Promise<readonly ConvexThoughtRow[]>;
  /** POST /api/thoughts/list — filter pushdown (type, topic, person, days, limit). */
  listThoughts(input: ConvexListFilter): Promise<readonly ConvexThoughtRow[]>;
  thoughtStats(input: { userId: string }): Promise<ThoughtStatsResponse>;
  memoryRecall(input: ConvexRecallInput): Promise<MemoryRecallResponse>;
  memoryWriteback(input: ConvexWritebackInput): Promise<{ thoughtId: string }>;
  memoryReview(input: ConvexReviewInput): Promise<ReviewResponse>;
  listEntities(input: ConvexListEntitiesInput): Promise<readonly ConvexEntityRow[]>;
  getEntity(input: ConvexGetEntityInput): Promise<{
    entity: ConvexEntityRow | null;
    mentions: readonly ConvexEntityMentionRow[];
  }>;
  entityRelations(input: ConvexEntityRelationsInput): Promise<{
    outgoing: readonly ConvexEntityRelationRow[];
    incoming: readonly ConvexEntityRelationRow[];
  }>;
}

interface ConvexClientOptions {
  convexUrl: string;
  internalSecret: string;
  fetch?: FetchLike;
}

const SECRET_HEADER = "X-OpenBrains-Internal-Secret";
const USER_HEADER = "X-OpenBrains-User-Id";

class ConvexHttpError extends Error {
  public readonly status: number;
  public constructor(message: string, status: number) {
    super(message);
    this.name = "ConvexHttpError";
    this.status = status;
  }
}

/**
 * Thrown by `memoryReview` when the server refuses promotion because the
 * status was not `confirmed`. The tool layer maps this to a tool-level
 * failure rather than crashing the request.
 */
class ConvexReviewRequiredError extends Error {
  public constructor() {
    super("REQUIRES_REVIEW");
    this.name = "ConvexReviewRequiredError";
  }
}

export function createConvexClient(options: ConvexClientOptions): ConvexClient {
  const base = options.convexUrl.replace(/\/$/, "");
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  function headers(userId: string): Record<string, string> {
    return {
      "content-type": "application/json",
      [SECRET_HEADER]: options.internalSecret,
      [USER_HEADER]: userId,
    };
  }

  async function postJson(
    path: string,
    userId: string,
    body: unknown,
  ): Promise<{ status: number; text: string; json: unknown }> {
    const res = await doFetch(`${base}${path}`, {
      method: "POST",
      headers: headers(userId),
      body: JSON.stringify(body),
    });
    const text = res.status === 204 ? "" : await res.text();
    let json: unknown = null;
    if (text !== "") {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = null;
      }
    }
    if (res.status < 200 || res.status >= 300 || (text !== "" && json === null)) {
      console.warn(
        JSON.stringify({
          evt: "convex.http",
          path,
          status: res.status,
          bodyLen: text.length,
          body: text.slice(0, 512),
        }),
      );
    }
    return { status: res.status, text, json };
  }

  async function post<T>(
    path: string,
    userId: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const { status, text, json } = await postJson(path, userId, body);
    if (status < 200 || status >= 300) {
      const detail = text === "" ? "<empty body>" : text.slice(0, 200);
      throw new ConvexHttpError(`convex ${path} failed: ${status.toString()} ${detail}`, status);
    }
    if (json === null && text === "") {
      throw new ConvexHttpError(
        `convex ${path} returned empty body (status ${status.toString()})`,
        status,
      );
    }
    return schema.parse(json);
  }

  async function get<T>(path: string, userId: string, schema: z.ZodType<T>): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method: "GET",
      headers: headers(userId),
    });
    if (!res.ok) {
      throw new ConvexHttpError(`convex ${path} failed: ${res.status.toString()}`, res.status);
    }
    const json = (await res.json()) as unknown;
    return schema.parse(json);
  }

  return {
    async captureThought(input) {
      const body = {
        content: input.content,
        source: input.source,
        embeddingModel: input.embeddingModel,
        embeddingDims: input.embeddingDims,
        fingerprint: input.fingerprint,
        metadata: input.metadata,
      };
      return await post("/api/thoughts", input.userId, body, CaptureResponseSchema);
    },
    async getByFingerprint(input) {
      const { thought } = await post(
        "/api/thoughts/by-fingerprint",
        input.userId,
        { fingerprint: input.fingerprint },
        ByFingerprintResponseSchema,
      );
      return thought;
    },
    async getThoughtsByIds(input) {
      const { rows } = await post(
        "/api/thoughts/search",
        input.userId,
        { ids: input.ids },
        ThoughtRowsResponseSchema,
      );
      return rows;
    },
    async listThoughts(input) {
      const body: {
        limit?: number;
        type?: string;
        topic?: string;
        person?: string;
        days?: number;
      } = {};
      if (input.limit !== undefined) {
        body.limit = input.limit;
      }
      if (input.type !== undefined) {
        body.type = input.type;
      }
      if (input.topic !== undefined) {
        body.topic = input.topic;
      }
      if (input.person !== undefined) {
        body.person = input.person;
      }
      if (input.days !== undefined) {
        body.days = input.days;
      }
      const { rows } = await post(
        "/api/thoughts/list",
        input.userId,
        body,
        ThoughtRowsResponseSchema,
      );
      return rows;
    },
    async thoughtStats(input) {
      return await get("/api/thoughts/stats", input.userId, ThoughtStatsResponseSchema);
    },
    async memoryRecall(input) {
      const body: { thoughtIds: readonly string[]; query?: string; scores?: readonly number[] } = {
        thoughtIds: input.thoughtIds,
      };
      if (input.query !== undefined) {
        body.query = input.query;
      }
      if (input.scores !== undefined) {
        body.scores = input.scores;
      }
      return await post("/api/memory/recall", input.userId, body, MemoryRecallResponseSchema);
    },
    async memoryWriteback(input) {
      const provenance: ConvexWritebackProvenance = { origin: input.provenance.origin };
      if (input.provenance.agent !== undefined) {
        provenance.agent = input.provenance.agent;
      }
      if (input.provenance.agentVersion !== undefined) {
        provenance.agentVersion = input.provenance.agentVersion;
      }
      if (input.provenance.sessionId !== undefined) {
        provenance.sessionId = input.provenance.sessionId;
      }
      const body: {
        content: string;
        source: string;
        embeddingModel: string;
        embeddingDims: number;
        fingerprint: string;
        metadata: ThoughtMetadata;
        provenance: ConvexWritebackProvenance;
        scopes?: readonly string[];
        vectorizeId?: string;
      } = {
        content: input.content,
        source: input.source,
        embeddingModel: input.embeddingModel,
        embeddingDims: input.embeddingDims,
        fingerprint: input.fingerprint,
        metadata: input.metadata,
        provenance,
      };
      if (input.scopes !== undefined) {
        body.scopes = input.scopes;
      }
      if (input.vectorizeId !== undefined) {
        body.vectorizeId = input.vectorizeId;
      }
      return await post("/api/memory/writeback", input.userId, body, WritebackResponseSchema);
    },
    async memoryReview(input) {
      const body: {
        thoughtId: string;
        status: MemoryReviewStatus;
        promoteTo?: "instruction";
        note?: string;
      } = {
        thoughtId: input.thoughtId,
        status: input.status,
      };
      if (input.promoteTo !== undefined) {
        body.promoteTo = input.promoteTo;
      }
      if (input.note !== undefined) {
        body.note = input.note;
      }
      const { status, json } = await postJson("/api/memory/review", input.userId, body);
      if (status === 422) {
        const err = ReviewRequiresReviewErrorSchema.safeParse(json);
        if (err.success) {
          throw new ConvexReviewRequiredError();
        }
      }
      if (status < 200 || status >= 300) {
        throw new ConvexHttpError(`convex /api/memory/review failed: ${status.toString()}`, status);
      }
      return ReviewResponseSchema.parse(json);
    },
    async listEntities(input) {
      const body: { kind?: string; limit?: number } = {};
      if (input.kind !== undefined) {
        body.kind = input.kind;
      }
      if (input.limit !== undefined) {
        body.limit = input.limit;
      }
      const { rows } = await post(
        "/api/entities/list",
        input.userId,
        body,
        EntityListResponseSchema,
      );
      return rows;
    },
    async getEntity(input) {
      const body: { entityId: string; mentionsLimit?: number } = { entityId: input.entityId };
      if (input.mentionsLimit !== undefined) {
        body.mentionsLimit = input.mentionsLimit;
      }
      return await post("/api/entities/get", input.userId, body, EntityGetResponseSchema);
    },
    async entityRelations(input) {
      const body: { entityId: string; limit?: number } = { entityId: input.entityId };
      if (input.limit !== undefined) {
        body.limit = input.limit;
      }
      return await post(
        "/api/entities/relations",
        input.userId,
        body,
        EntityRelationsResponseSchema,
      );
    },
  };
}

export { ConvexHttpError, ConvexReviewRequiredError };
