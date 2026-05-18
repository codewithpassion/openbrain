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
 */

import type { MemoryOrigin, ThoughtMetadata, TrustGrade } from "@openbrains/shared";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ConvexThoughtRow {
  _id: string;
  userId: string;
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: ThoughtMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface ConvexCaptureInput {
  userId: string;
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: ThoughtMetadata;
}

export interface ConvexWritebackInput extends ConvexCaptureInput {
  origin: MemoryOrigin;
  trustGrade: TrustGrade;
  scopes: readonly string[];
  agent?: string;
  agentVersion?: string;
  sessionId?: string;
  sourceRef?: { kind: string; uri: string; excerpt?: string };
}

export interface ConvexReviewInput {
  userId: string;
  thoughtId: string;
  status: "unreviewed" | "confirmed" | "rejected" | "needs_revision";
  reviewer: string;
  promoteTo?: TrustGrade;
  note?: string;
}

export interface ConvexClient {
  captureThought(input: ConvexCaptureInput): Promise<{ id: string }>;
  /**
   * Returns an existing thoughtId for `(userId, fingerprint)` if any. Used by
   * `capture-thought` to satisfy the spec's idempotency requirement.
   *
   * NOTE — DEVIATION from `packages/convex/convex/http.ts`: that file does not
   * yet expose `getByFingerprint` over HTTP. The real Convex query
   * (`thoughts.getByFingerprint`) exists; wiring it up requires a small
   * addition to `http.ts` (open item — out of this app's scope).
   */
  getByFingerprint(input: { userId: string; fingerprint: string }): Promise<{ id: string } | null>;
  getThoughtsByIds(input: {
    userId: string;
    ids: readonly string[];
  }): Promise<readonly ConvexThoughtRow[]>;
  listThoughts(input: { userId: string; limit?: number }): Promise<readonly ConvexThoughtRow[]>;
  thoughtStats(input: { userId: string }): Promise<{
    total: number;
    byType: Record<string, number>;
    topTopics: readonly { topic: string; count: number }[];
  }>;
  memoryWriteback(input: ConvexWritebackInput): Promise<{ id: string }>;
  memoryReview(input: ConvexReviewInput): Promise<{ id: string }>;
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

  async function post<T>(path: string, userId: string, body: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method: "POST",
      headers: headers(userId),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ConvexHttpError(`convex ${path} failed: ${res.status.toString()}`, res.status);
    }
    return (await res.json()) as T;
  }

  async function get<T>(path: string, userId: string): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method: "GET",
      headers: headers(userId),
    });
    if (!res.ok) {
      throw new ConvexHttpError(`convex ${path} failed: ${res.status.toString()}`, res.status);
    }
    return (await res.json()) as T;
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
      return await post<{ id: string }>("/api/thoughts", input.userId, body);
    },
    async getByFingerprint(input) {
      const { id } = await post<{ id: string | null }>(
        "/api/thoughts/by-fingerprint",
        input.userId,
        { fingerprint: input.fingerprint },
      );
      return id === null ? null : { id };
    },
    async getThoughtsByIds(input) {
      const { rows } = await post<{ rows: readonly ConvexThoughtRow[] }>(
        "/api/thoughts/search",
        input.userId,
        { ids: input.ids },
      );
      return rows;
    },
    async listThoughts(input) {
      const qs = input.limit === undefined ? "" : `?limit=${input.limit.toString()}`;
      const { rows } = await get<{ rows: readonly ConvexThoughtRow[] }>(
        `/api/thoughts${qs}`,
        input.userId,
      );
      return rows;
    },
    async thoughtStats(input) {
      return await get<{
        total: number;
        byType: Record<string, number>;
        topTopics: readonly { topic: string; count: number }[];
      }>("/api/thoughts/stats", input.userId);
    },
    async memoryWriteback(input) {
      const body = {
        content: input.content,
        source: input.source,
        embeddingModel: input.embeddingModel,
        embeddingDims: input.embeddingDims,
        fingerprint: input.fingerprint,
        metadata: input.metadata,
        origin: input.origin,
        ...(input.agent === undefined ? {} : { agent: input.agent }),
        ...(input.agentVersion === undefined ? {} : { agentVersion: input.agentVersion }),
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      };
      return await post<{ id: string }>("/api/memory/writeback", input.userId, body);
    },
    async memoryReview(input) {
      const body = {
        thoughtId: input.thoughtId,
        status: input.status,
        reviewer: input.reviewer,
        ...(input.note === undefined ? {} : { note: input.note }),
      };
      return await post<{ id: string }>("/api/memory/review", input.userId, body);
    },
  };
}

export { ConvexHttpError };
