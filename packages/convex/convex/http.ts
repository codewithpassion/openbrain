// SECURITY: HTTP actions are the MCP Worker's entry into Convex. They trust two
// request headers — X-OpenBrains-Internal-Secret (shared secret matching the
// INTERNAL_API_SECRET env var) and X-OpenBrains-User-Id (the Clerk userId the
// Worker resolved from the OAuth token). All other endpoints must use
// `requireUserId` via ctx.auth (Clerk JWT). This file is the only trust
// boundary that bypasses ctx.auth; if the secret header is missing or wrong,
// every endpoint returns 401 with no body. See packages/convex/README.md.
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
    return new Response(null, { status: 401 });
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

interface CaptureBody {
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: {
    type?: string;
    topics: string[];
    people: string[];
    action_items: string[];
    dates_mentioned: string[];
  };
}

function isCaptureBody(body: unknown): body is CaptureBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<CaptureBody>;
  return (
    typeof b.content === "string" &&
    typeof b.source === "string" &&
    typeof b.embeddingModel === "string" &&
    typeof b.embeddingDims === "number" &&
    typeof b.fingerprint === "string" &&
    typeof b.metadata === "object" &&
    b.metadata !== null
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
  const id = await ctx.runMutation(internal.thoughts.createThoughtInternal, {
    userId: auth.userId,
    content: body.content,
    source: body.source,
    embeddingModel: body.embeddingModel,
    embeddingDims: body.embeddingDims,
    fingerprint: body.fingerprint,
    metadata: body.metadata,
  });
  return jsonResponse({ id });
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

const thoughtStats = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const stats = await ctx.runQuery(internal.thoughts.statsInternal, { userId: auth.userId });
  return jsonResponse(stats);
});

interface RecallBody {
  ids: string[];
}

const memoryRecall = httpAction(async (ctx, request) => {
  const auth = authorize(request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJson(request);
  if (!isSearchBody(body)) {
    return jsonResponse({ error: "invalid body" }, 400);
  }
  const recall = body as RecallBody;
  const rows = await ctx.runQuery(internal.thoughts.getByIdsInternal, {
    userId: auth.userId,
    ids: recall.ids as unknown as Id<"thoughts">[],
  });
  return jsonResponse({ rows });
});

interface WritebackBody {
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: CaptureBody["metadata"];
  origin: "human" | "agent_inferred" | "agent_generated" | "import";
  agent?: string;
  agentVersion?: string;
  sessionId?: string;
}

function isWritebackBody(body: unknown): body is WritebackBody {
  if (!isCaptureBody(body)) {
    return false;
  }
  const origin = (body as Partial<WritebackBody>).origin;
  return (
    origin === "human" ||
    origin === "agent_inferred" ||
    origin === "agent_generated" ||
    origin === "import"
  );
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
  const thoughtId = await ctx.runMutation(internal.thoughts.createThoughtInternal, {
    userId: auth.userId,
    content: body.content,
    source: body.source,
    embeddingModel: body.embeddingModel,
    embeddingDims: body.embeddingDims,
    fingerprint: body.fingerprint,
    metadata: body.metadata,
  });
  const provArgs: {
    userId: string;
    thoughtId: typeof thoughtId;
    origin: WritebackBody["origin"];
    agent?: string;
    agentVersion?: string;
    sessionId?: string;
  } = { userId: auth.userId, thoughtId, origin: body.origin };
  if (body.agent !== undefined) {
    provArgs.agent = body.agent;
  }
  if (body.agentVersion !== undefined) {
    provArgs.agentVersion = body.agentVersion;
  }
  if (body.sessionId !== undefined) {
    provArgs.sessionId = body.sessionId;
  }
  await ctx.runMutation(internal.memory.provenance.recordInternal, provArgs);
  return jsonResponse({ id: thoughtId });
});

interface ReviewBody {
  thoughtId: string;
  status: "unreviewed" | "confirmed" | "rejected" | "needs_revision";
  reviewer: string;
  note?: string;
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
  return (
    typeof b.thoughtId === "string" &&
    typeof b.reviewer === "string" &&
    typeof b.status === "string" &&
    validStatuses.includes(b.status as ReviewBody["status"])
  );
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
    reviewer: string;
    note?: string;
  } = {
    userId: auth.userId,
    thoughtId: body.thoughtId as unknown as Id<"thoughts">,
    status: body.status,
    reviewer: body.reviewer,
  };
  if (body.note !== undefined) {
    args.note = body.note;
  }
  const id = await ctx.runMutation(internal.memory.review.submitInternal, args);
  return jsonResponse({ id });
});

// `api` is imported only so its symbol is preserved in this module's surface
// for downstream codegen; reference it to suppress noUnusedLocals.
void api;

const http = httpRouter();
http.route({ path: "/api/thoughts", method: "POST", handler: captureThought });
http.route({ path: "/api/thoughts/search", method: "POST", handler: searchThoughts });
http.route({ path: "/api/thoughts", method: "GET", handler: listThoughts });
http.route({ path: "/api/thoughts/stats", method: "GET", handler: thoughtStats });
http.route({ path: "/api/memory/recall", method: "POST", handler: memoryRecall });
http.route({ path: "/api/memory/writeback", method: "POST", handler: memoryWriteback });
http.route({ path: "/api/memory/review", method: "POST", handler: memoryReview });

export default http;
