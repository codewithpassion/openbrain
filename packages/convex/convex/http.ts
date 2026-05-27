// SECURITY: HTTP actions are the MCP Worker's entry into Convex. They trust two
// request headers — X-OpenBrains-Internal-Secret (shared secret matching the
// INTERNAL_API_SECRET env var) and X-OpenBrains-User-Id (the Clerk userId the
// Worker resolved from the OAuth token). All other endpoints must use
// `requireUserId` via ctx.auth (Clerk JWT). This file is the only trust
// boundary that bypasses ctx.auth; if the secret header is missing or wrong,
// every endpoint returns 401 with no body. If the secret is correct but the
// user-id header is missing, endpoints return 400 (caller bug, not auth).
// See packages/convex/README.md.
import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { httpAction } from "./_generated/server.js";

const SECRET_HEADER = "x-openbrains-internal-secret";
const USER_HEADER = "x-openbrains-user-id";

interface AuthorizedRequest {
  userId: string;
}

function authorize(request: Request): AuthorizedRequest | Response {
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket access on process.env
  const expected = process.env["INTERNAL_API_SECRET"];
  if (expected === undefined || expected === "") {
    return new Response(null, { status: 500 });
  }
  const provided = request.headers.get(SECRET_HEADER);
  if (provided === null || !constantTimeEquals(provided, expected)) {
    return new Response(null, { status: 401 });
  }
  const userId = request.headers.get(USER_HEADER);
  if (userId === null || userId === "") {
    // Secret matched but userId missing — this is a Worker bug, not an auth
    // failure. 400 makes the diagnosis obvious.
    return new Response(null, { status: 400 });
  }
  return { userId };
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface ThoughtMetadataBody {
  type?: string;
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
}

interface CaptureBody {
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: ThoughtMetadataBody;
  scope?: string;
}

function isMetadataBody(value: unknown): value is ThoughtMetadataBody {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const m = value as Partial<ThoughtMetadataBody>;
  return (
    Array.isArray(m.topics) &&
    Array.isArray(m.people) &&
    Array.isArray(m.action_items) &&
    Array.isArray(m.dates_mentioned)
  );
}

function isCaptureBody(body: unknown): body is CaptureBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<CaptureBody>;
  if (b.scope !== undefined && typeof b.scope !== "string") {
    return false;
  }
  return (
    typeof b.content === "string" &&
    typeof b.source === "string" &&
    typeof b.embeddingModel === "string" &&
    typeof b.embeddingDims === "number" &&
    typeof b.fingerprint === "string" &&
    isMetadataBody(b.metadata)
  );
}

const captureThought = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isCaptureBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  try {
    const id = await ctx.runMutation(internal.thoughts.createThoughtInternal, {
      userId: auth.userId,
      content: body.content,
      source: body.source,
      embeddingModel: body.embeddingModel,
      embeddingDims: body.embeddingDims,
      fingerprint: body.fingerprint,
      metadata: body.metadata,
      ...(body.scope === undefined ? {} : { scope: body.scope }),
    });
    return jsonResponse({ id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/PROJECT_NOT_FOUND/.test(message)) {
      return jsonResponse({ error: "PROJECT_NOT_FOUND" }, 404);
    }
    throw e;
  }
});

interface UpdateBody {
  id: string;
  content: string;
  fingerprint: string;
  metadata: ThoughtMetadataBody;
  embeddingModel?: string;
  embeddingDims?: number;
}

function isUpdateBody(body: unknown): body is UpdateBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<UpdateBody>;
  if (typeof b.id !== "string") {
    return false;
  }
  if (typeof b.content !== "string") {
    return false;
  }
  if (typeof b.fingerprint !== "string") {
    return false;
  }
  if (!isMetadataBody(b.metadata)) {
    return false;
  }
  if (b.embeddingModel !== undefined && typeof b.embeddingModel !== "string") {
    return false;
  }
  if (b.embeddingDims !== undefined && typeof b.embeddingDims !== "number") {
    return false;
  }
  return true;
}

const updateThought = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isUpdateBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  try {
    const args: {
      userId: string;
      id: Id<"thoughts">;
      content: string;
      fingerprint: string;
      metadata: ThoughtMetadataBody;
      embeddingModel?: string;
      embeddingDims?: number;
    } = {
      userId: auth.userId,
      id: body.id as unknown as Id<"thoughts">,
      content: body.content,
      fingerprint: body.fingerprint,
      metadata: body.metadata,
    };
    if (body.embeddingModel !== undefined) {
      args.embeddingModel = body.embeddingModel;
    }
    if (body.embeddingDims !== undefined) {
      args.embeddingDims = body.embeddingDims;
    }
    await ctx.runMutation(internal.thoughts.updateContentInternal, args);
    return jsonResponse({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/FINGERPRINT_COLLISION/.test(message)) {
      return jsonResponse({ error: "FINGERPRINT_COLLISION" }, 409);
    }
    if (/NOT_FOUND/.test(message)) {
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    }
    throw e;
  }
});

interface SearchBody {
  ids: string[];
}

function isSearchBody(body: unknown): body is SearchBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const ids = (body as Partial<SearchBody>).ids;
  return Array.isArray(ids) && ids.every((i) => typeof i === "string");
}

const searchThoughts = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isSearchBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  const rows = await ctx.runQuery(internal.thoughts.getByIdsInternal, {
    userId: auth.userId,
    ids: body.ids as unknown as Id<"thoughts">[],
  });
  return jsonResponse({ rows });
});

const listThoughts = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number.parseInt(limitParam, 10);
  const rows = await ctx.runQuery(internal.thoughts.listThoughtsInternal, {
    userId: auth.userId,
    ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
  });
  return jsonResponse({ rows });
});

interface ListBody {
  limit?: number;
  type?: string;
  topic?: string;
  person?: string;
  days?: number;
  scope?: string;
}

function isListBody(body: unknown): body is ListBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<ListBody>;
  if (b.limit !== undefined && typeof b.limit !== "number") {
    return false;
  }
  if (b.type !== undefined && typeof b.type !== "string") {
    return false;
  }
  if (b.topic !== undefined && typeof b.topic !== "string") {
    return false;
  }
  if (b.person !== undefined && typeof b.person !== "string") {
    return false;
  }
  if (b.days !== undefined && typeof b.days !== "number") {
    return false;
  }
  if (b.scope !== undefined && typeof b.scope !== "string") {
    return false;
  }
  return true;
}

const listThoughtsPost = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isListBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  const args: {
    userId: string;
    limit?: number;
    type?: string;
    topic?: string;
    person?: string;
    days?: number;
    scope?: string;
  } = { userId: auth.userId };
  if (body.limit !== undefined) {
    args.limit = body.limit;
  }
  if (body.type !== undefined) {
    args.type = body.type;
  }
  if (body.topic !== undefined) {
    args.topic = body.topic;
  }
  if (body.person !== undefined) {
    args.person = body.person;
  }
  if (body.days !== undefined) {
    args.days = body.days;
  }
  if (body.scope !== undefined) {
    args.scope = body.scope;
  }
  const rows = await ctx.runQuery(internal.thoughts.listThoughtsInternal, args);
  return jsonResponse({ rows });
});

const thoughtStats = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const stats = await ctx.runQuery(internal.thoughts.statsInternal, { userId: auth.userId });
  return jsonResponse(stats);
});

interface FingerprintBody {
  fingerprint: string;
  scope?: string;
}

function isFingerprintBody(body: unknown): body is FingerprintBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<FingerprintBody>;
  if (b.scope !== undefined && typeof b.scope !== "string") {
    return false;
  }
  return typeof b.fingerprint === "string";
}

const thoughtsByFingerprint = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isFingerprintBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  const thought = await ctx.runQuery(internal.thoughts.getByFingerprintInternal, {
    userId: auth.userId,
    fingerprint: body.fingerprint,
    ...(body.scope === undefined ? {} : { scope: body.scope }),
  });
  return jsonResponse({ thought });
});

interface RecallBody {
  thoughtIds: string[];
  query?: string;
  scores?: number[];
}

function isRecallBody(body: unknown): body is RecallBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<RecallBody>;
  if (!(Array.isArray(b.thoughtIds) && b.thoughtIds.every((i) => typeof i === "string"))) {
    return false;
  }
  if (b.query !== undefined && typeof b.query !== "string") {
    return false;
  }
  if (
    b.scores !== undefined &&
    !(Array.isArray(b.scores) && b.scores.every((s) => typeof s === "number"))
  ) {
    return false;
  }
  return true;
}

const memoryRecall = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isRecallBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  // The MCP Worker may not yet pass `query`/`scores`; default to empty so the
  // trace row is still well-formed. See README §"Recall traces".
  const result = await ctx.runMutation(internal.memory.recall.recallInternal, {
    userId: auth.userId,
    thoughtIds: body.thoughtIds as unknown as Id<"thoughts">[],
    query: body.query ?? "",
    scores: body.scores ?? [],
    clientId: "mcp",
  });
  return jsonResponse(result);
});

interface WritebackProvenanceBody {
  origin: "agent_inferred" | "agent_generated";
  agent?: string;
  agentVersion?: string;
  sessionId?: string;
}

interface WritebackBody {
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: ThoughtMetadataBody;
  provenance: WritebackProvenanceBody;
  scopes?: string[];
  vectorizeId?: string;
}

function isWritebackProvenance(value: unknown): value is WritebackProvenanceBody {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const p = value as Partial<WritebackProvenanceBody>;
  return p.origin === "agent_inferred" || p.origin === "agent_generated";
}

function isWritebackBody(body: unknown): body is WritebackBody {
  if (!isCaptureBody(body)) {
    return false;
  }
  const b = body as unknown as Partial<WritebackBody>;
  if (!isWritebackProvenance(b.provenance)) {
    return false;
  }
  if (
    b.scopes !== undefined &&
    !(Array.isArray(b.scopes) && b.scopes.every((s) => typeof s === "string"))
  ) {
    return false;
  }
  return true;
}

const memoryWriteback = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isWritebackBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  // NOTE: any incoming `trustGrade` field on the body is ignored by design
  // (CLAUDE.md §7). The internal mutation has no such argument; the grade is
  // hard-wired to "evidence".
  const provenance: WritebackProvenanceBody = { origin: body.provenance.origin };
  if (body.provenance.agent !== undefined) {
    provenance.agent = body.provenance.agent;
  }
  if (body.provenance.agentVersion !== undefined) {
    provenance.agentVersion = body.provenance.agentVersion;
  }
  if (body.provenance.sessionId !== undefined) {
    provenance.sessionId = body.provenance.sessionId;
  }
  const args: {
    userId: string;
    content: string;
    source: string;
    embeddingModel: string;
    embeddingDims: number;
    fingerprint: string;
    metadata: ThoughtMetadataBody;
    provenance: WritebackProvenanceBody;
    scopes?: string[];
    vectorizeId?: string;
  } = {
    userId: auth.userId,
    content: body.content,
    source: body.source,
    embeddingModel: body.embeddingModel,
    embeddingDims: body.embeddingDims,
    fingerprint: body.fingerprint,
    metadata: body.metadata,
    provenance,
  };
  if (body.scopes !== undefined) {
    args.scopes = body.scopes;
  }
  if (body.vectorizeId !== undefined) {
    args.vectorizeId = body.vectorizeId;
  }
  const { thoughtId } = await ctx.runMutation(internal.memory.writeback.writebackInternal, args);
  return jsonResponse({ thoughtId });
});

interface ReviewBody {
  thoughtId: string;
  status: "unreviewed" | "confirmed" | "rejected" | "needs_revision";
  note?: string;
  promoteTo?: "instruction";
}

function isReviewBody(body: unknown): body is ReviewBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<ReviewBody>;
  const validStatuses: readonly ReviewBody["status"][] = [
    "unreviewed",
    "confirmed",
    "rejected",
    "needs_revision",
  ];
  if (typeof b.thoughtId !== "string") {
    return false;
  }
  if (typeof b.status !== "string" || !validStatuses.includes(b.status as ReviewBody["status"])) {
    return false;
  }
  if (b.promoteTo !== undefined && b.promoteTo !== "instruction") {
    return false;
  }
  if (b.note !== undefined && typeof b.note !== "string") {
    return false;
  }
  return true;
}

const memoryReview = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isReviewBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  const args: {
    userId: string;
    thoughtId: Id<"thoughts">;
    status: ReviewBody["status"];
    note?: string;
    promoteTo?: "instruction";
  } = {
    userId: auth.userId,
    thoughtId: body.thoughtId as unknown as Id<"thoughts">,
    status: body.status,
  };
  if (body.note !== undefined) {
    args.note = body.note;
  }
  if (body.promoteTo !== undefined) {
    args.promoteTo = body.promoteTo;
  }
  try {
    const result = await ctx.runMutation(internal.memory.review.submitAndPromoteInternal, args);
    return jsonResponse(result);
  } catch (e) {
    // The submit-and-promote mutation throws ConvexError({code:"REQUIRES_REVIEW"})
    // when the caller asks to promote without a confirmed status. Surface that
    // as a 422 so the Worker can map it back to a tool-level failure.
    const code = (e as { data?: { code?: string } }).data?.code;
    if (code === "REQUIRES_REVIEW") {
      return jsonResponse({ error: "REQUIRES_REVIEW" }, 422);
    }
    throw e;
  }
});

/* -------------------------------------------------------------------------
 * Entity tools (Phase C)
 * ----------------------------------------------------------------------- */

interface ListEntitiesBody {
  kind?: string;
  limit?: number;
}

function isListEntitiesBody(body: unknown): body is ListEntitiesBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<ListEntitiesBody>;
  if (b.kind !== undefined && typeof b.kind !== "string") {
    return false;
  }
  if (b.limit !== undefined && typeof b.limit !== "number") {
    return false;
  }
  return true;
}

const listEntities = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isListEntitiesBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  const args: { userId: string; kind?: string; limit?: number } = { userId: auth.userId };
  if (body.kind !== undefined) {
    args.kind = body.kind;
  }
  if (body.limit !== undefined) {
    args.limit = body.limit;
  }
  const rows = await ctx.runQuery(internal.entities.listInternal, args);
  return jsonResponse({ rows });
});

interface GetEntityBody {
  entityId: string;
  mentionsLimit?: number;
}

function isGetEntityBody(body: unknown): body is GetEntityBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<GetEntityBody>;
  if (typeof b.entityId !== "string") {
    return false;
  }
  if (b.mentionsLimit !== undefined && typeof b.mentionsLimit !== "number") {
    return false;
  }
  return true;
}

const getEntity = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isGetEntityBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  const args: {
    userId: string;
    entityId: Id<"entities">;
    mentionsLimit?: number;
  } = {
    userId: auth.userId,
    entityId: body.entityId as unknown as Id<"entities">,
  };
  if (body.mentionsLimit !== undefined) {
    args.mentionsLimit = body.mentionsLimit;
  }
  const result = await ctx.runQuery(internal.entities.getByIdInternal, args);
  return jsonResponse(result);
});

interface EntityRelationsBody {
  entityId: string;
  limit?: number;
}

function isEntityRelationsBody(body: unknown): body is EntityRelationsBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<EntityRelationsBody>;
  if (typeof b.entityId !== "string") {
    return false;
  }
  if (b.limit !== undefined && typeof b.limit !== "number") {
    return false;
  }
  return true;
}

const entityRelations = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isEntityRelationsBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  const args: { userId: string; entityId: Id<"entities">; limit?: number } = {
    userId: auth.userId,
    entityId: body.entityId as unknown as Id<"entities">,
  };
  if (body.limit !== undefined) {
    args.limit = body.limit;
  }
  const result = await ctx.runQuery(internal.entities.relationsInternal, args);
  return jsonResponse(result);
});

interface SetTypeBody {
  thoughtId: string;
  type: string;
}

function isSetTypeBody(body: unknown): body is SetTypeBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<SetTypeBody>;
  return typeof b.thoughtId === "string" && typeof b.type === "string";
}

const setThoughtType = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isSetTypeBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  try {
    const wrote = await ctx.runMutation(internal.thoughts.setTypeInternal, {
      userId: auth.userId,
      thoughtId: body.thoughtId as unknown as Id<"thoughts">,
      type: body.type,
    });
    return jsonResponse({ wrote });
  } catch (e) {
    if (e instanceof Error && /NOT_FOUND/.test(e.message)) {
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    }
    throw e;
  }
});

interface MergeMetadataBody {
  thoughtId: string;
  metadata: ThoughtMetadataBody;
}

function isMergeMetadataBody(body: unknown): body is MergeMetadataBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<MergeMetadataBody>;
  return typeof b.thoughtId === "string" && isMetadataBody(b.metadata);
}

const mergeMetadata = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isMergeMetadataBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  try {
    await ctx.runMutation(internal.thoughts.mergeMetadataInternal, {
      userId: auth.userId,
      thoughtId: body.thoughtId as unknown as Id<"thoughts">,
      metadata: body.metadata,
    });
    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof Error && /NOT_FOUND/.test(e.message)) {
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    }
    throw e;
  }
});

interface PersistSplitBody {
  parentThoughtId: string;
  ideas: { content: string; type?: string; topics: string[] }[];
}

function isPersistSplitBody(body: unknown): body is PersistSplitBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<PersistSplitBody>;
  if (typeof b.parentThoughtId !== "string") {
    return false;
  }
  if (!Array.isArray(b.ideas)) {
    return false;
  }
  return b.ideas.every((i) => {
    if (i === null || typeof i !== "object") {
      return false;
    }
    const idea = i as { content?: unknown; type?: unknown; topics?: unknown };
    return (
      typeof idea.content === "string" &&
      Array.isArray(idea.topics) &&
      idea.topics.every((t) => typeof t === "string") &&
      (idea.type === undefined || typeof idea.type === "string")
    );
  });
}

const persistSplit = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isPersistSplitBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  try {
    const result = await ctx.runMutation(internal.thoughts.persistSplitInternal, {
      userId: auth.userId,
      parentThoughtId: body.parentThoughtId as unknown as Id<"thoughts">,
      ideas: body.ideas,
    });
    return jsonResponse({ created: result.created, childIds: result.childIds });
  } catch (e) {
    if (e instanceof Error && /NOT_FOUND/.test(e.message)) {
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    }
    throw e;
  }
});

interface CreateProjectBody {
  slug: string;
  name: string;
  description?: string;
}

function isCreateProjectBody(body: unknown): body is CreateProjectBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<CreateProjectBody>;
  if (typeof b.slug !== "string" || typeof b.name !== "string") {
    return false;
  }
  if (b.description !== undefined && typeof b.description !== "string") {
    return false;
  }
  return true;
}

const projectsCreate = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isCreateProjectBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  try {
    const id = await ctx.runMutation(internal.projects.createInternal, {
      userId: auth.userId,
      slug: body.slug,
      name: body.name,
      ...(body.description === undefined ? {} : { description: body.description }),
    });
    return jsonResponse({ id, slug: body.slug });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/INVALID_SLUG/.test(message)) {
      return jsonResponse({ error: "INVALID_SLUG" }, 400);
    }
    if (/SLUG_TAKEN/.test(message)) {
      return jsonResponse({ error: "SLUG_TAKEN" }, 409);
    }
    throw e;
  }
});

const projectsList = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const rows = await ctx.runQuery(internal.projects.listInternal, { userId: auth.userId });
  return jsonResponse({ rows });
});

// `api` is imported only so its symbol is preserved in this module's surface
// for downstream codegen; reference it to suppress noUnusedLocals.
void api;

const http = httpRouter();
http.route({ path: "/api/thoughts", method: "POST", handler: captureThought });
http.route({ path: "/api/thoughts/update", method: "POST", handler: updateThought });
http.route({ path: "/api/thoughts/set-type", method: "POST", handler: setThoughtType });
http.route({ path: "/api/thoughts/merge-metadata", method: "POST", handler: mergeMetadata });
http.route({ path: "/api/thoughts/persist-split", method: "POST", handler: persistSplit });
http.route({ path: "/api/thoughts/search", method: "POST", handler: searchThoughts });
http.route({ path: "/api/thoughts", method: "GET", handler: listThoughts });
http.route({ path: "/api/thoughts/list", method: "POST", handler: listThoughtsPost });
http.route({
  path: "/api/thoughts/by-fingerprint",
  method: "POST",
  handler: thoughtsByFingerprint,
});
http.route({ path: "/api/thoughts/stats", method: "GET", handler: thoughtStats });
http.route({ path: "/api/memory/recall", method: "POST", handler: memoryRecall });
http.route({ path: "/api/memory/writeback", method: "POST", handler: memoryWriteback });
http.route({ path: "/api/memory/review", method: "POST", handler: memoryReview });
http.route({ path: "/api/entities/list", method: "POST", handler: listEntities });
http.route({ path: "/api/entities/get", method: "POST", handler: getEntity });
http.route({ path: "/api/entities/relations", method: "POST", handler: entityRelations });
http.route({ path: "/api/projects", method: "POST", handler: projectsCreate });
http.route({ path: "/api/projects/list", method: "POST", handler: projectsList });

export default http;
