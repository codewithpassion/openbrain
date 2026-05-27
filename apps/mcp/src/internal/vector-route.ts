/**
 * `POST /internal/vector/upsert` and `POST /internal/vector/delete` —
 * server-to-server bridge that lets Convex actions reach the Worker's
 * `VECTORIZE` binding. Symmetric with `/internal/ai/run`: gated by the same
 * `INTERNAL_API_SECRET` and a constant-time string compare.
 *
 * Upsert payload: `{ userId, id, values, metadata: { source, type? } }`.
 * The Worker maps `userId` to the Vectorize namespace (tenant isolation gate —
 * ARCHITECTURE.md §"Vectorize index"). Delete payload: `{ userId, id }`; the
 * userId is accepted for symmetry/audit even though `deleteByIds` is namespace-
 * agnostic today.
 */
import type { VectorizeBinding } from "../env";

const SECRET_HEADER = "x-openbrains-internal-secret";

export interface VectorRouteEnv {
  VECTORIZE: VectorizeBinding;
  INTERNAL_API_SECRET: string;
}

interface UpsertMetadata {
  source: string;
  type?: string;
}

interface UpsertBody {
  userId: string;
  id: string;
  values: readonly number[];
  metadata: UpsertMetadata;
}

interface DeleteBody {
  userId: string;
  id: string;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUpsertMetadata(value: unknown): value is UpsertMetadata {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const m = value as Partial<UpsertMetadata>;
  if (!isNonEmptyString(m.source)) {
    return false;
  }
  if (m.type !== undefined && typeof m.type !== "string") {
    return false;
  }
  return true;
}

function isUpsertBody(body: unknown): body is UpsertBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<UpsertBody>;
  if (!isNonEmptyString(b.userId)) {
    return false;
  }
  if (!isNonEmptyString(b.id)) {
    return false;
  }
  if (!Array.isArray(b.values) || b.values.length === 0) {
    return false;
  }
  if (!b.values.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return false;
  }
  if (!isUpsertMetadata(b.metadata)) {
    return false;
  }
  return true;
}

function isDeleteBody(body: unknown): body is DeleteBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<DeleteBody>;
  return isNonEmptyString(b.userId) && isNonEmptyString(b.id);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

function preflight(request: Request, env: VectorRouteEnv): Response | null {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  if (env.INTERNAL_API_SECRET === "") {
    return new Response(null, { status: 500 });
  }
  const provided = request.headers.get(SECRET_HEADER);
  if (provided === null || !constantTimeEquals(provided, env.INTERNAL_API_SECRET)) {
    return new Response(null, { status: 401 });
  }
  return null;
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export async function handleVectorUpsertRequest(
  request: Request,
  env: VectorRouteEnv,
): Promise<Response> {
  const gate = preflight(request, env);
  if (gate !== null) {
    return gate;
  }
  const raw = await readJson(request);
  if (!isUpsertBody(raw)) {
    return badRequest("invalid body");
  }
  const meta: Record<string, string> = { source: raw.metadata.source };
  if (raw.metadata.type !== undefined) {
    // biome-ignore lint/complexity/useLiteralKeys: bracket access required under noPropertyAccessFromIndexSignature
    meta["type"] = raw.metadata.type;
  }
  await env.VECTORIZE.upsert([
    {
      id: raw.id,
      values: raw.values,
      namespace: raw.userId,
      metadata: meta,
    },
  ]);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function handleVectorDeleteRequest(
  request: Request,
  env: VectorRouteEnv,
): Promise<Response> {
  const gate = preflight(request, env);
  if (gate !== null) {
    return gate;
  }
  const raw = await readJson(request);
  if (!isDeleteBody(raw)) {
    return badRequest("invalid body");
  }
  await env.VECTORIZE.deleteByIds([raw.id]);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const INTERNAL_VECTOR_UPSERT_PATH = "/internal/vector/upsert";
export const INTERNAL_VECTOR_DELETE_PATH = "/internal/vector/delete";
