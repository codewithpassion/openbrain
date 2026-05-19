/**
 * `POST /internal/ai/run` — server-to-server bridge that lets Convex actions
 * call the Worker's `AI` binding. Protected by the same shared secret used by
 * the Worker→Convex direction (`INTERNAL_API_SECRET`). Constant-time string
 * compare so timing leaks don't betray the secret.
 *
 * The payload shape mirrors `WorkersAiBinding.run`: `{ model, input }`. We do
 * not validate `input` here — the AI binding does that — but we do require
 * `input.text` to be a non-empty string[] so we can reject the trivial bad
 * cases without burning a Workers AI call.
 */
import type { WorkersAiBinding } from "@openbrains/ingest";

const SECRET_HEADER = "x-openbrains-internal-secret";

interface RunBody {
  model: string;
  input: { text: readonly string[] };
}

function isRunBody(body: unknown): body is RunBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<RunBody>;
  if (typeof b.model !== "string" || b.model === "") {
    return false;
  }
  if (b.input === undefined || b.input === null || typeof b.input !== "object") {
    return false;
  }
  const text = (b.input as { text?: unknown }).text;
  if (!Array.isArray(text) || text.length === 0) {
    return false;
  }
  return text.every((t) => typeof t === "string" && t.length > 0);
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

export interface AiRouteEnv {
  AI: WorkersAiBinding;
  INTERNAL_API_SECRET: string;
}

export async function handleAiRunRequest(request: Request, env: AiRouteEnv): Promise<Response> {
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
  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    raw = null;
  }
  if (!isRunBody(raw)) {
    return new Response(JSON.stringify({ error: "invalid body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const result = await env.AI.run(raw.model, raw.input);
  return new Response(JSON.stringify({ data: result.data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const INTERNAL_AI_RUN_PATH = "/internal/ai/run";
