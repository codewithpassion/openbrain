/**
 * `POST /internal/ai/chat` — server-to-server bridge that lets Convex actions
 * call the dashboard worker's `AI` binding for chat-completion models. Mirrors
 * the MCP worker's `/internal/ai/run` (embeddings) pattern: shared-secret
 * header with constant-time compare so timing leaks don't betray the secret.
 *
 * Body shape: `{ model, input: { messages, response_format? } }`. Response:
 * `{ response }` — exactly what the Workers AI chat binding returns. Tools
 * that consume this (entity extractor, metadata extractor, brain-dump
 * splitter, digest summarizer) self-handle missing/malformed responses.
 */

const SECRET_HEADER = "x-openbrains-internal-secret";

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatInput {
  messages: ChatMessage[];
  response_format?: { type: "json_object" };
}

interface ChatBody {
  model: string;
  input: ChatInput;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const m = value as Partial<ChatMessage>;
  return (
    typeof m.role === "string" &&
    m.role.length > 0 &&
    typeof m.content === "string" &&
    m.content.length > 0
  );
}

function isChatBody(body: unknown): body is ChatBody {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const b = body as Partial<ChatBody>;
  if (typeof b.model !== "string" || b.model === "") {
    return false;
  }
  if (b.input === undefined || b.input === null || typeof b.input !== "object") {
    return false;
  }
  const messages = (b.input as Partial<ChatInput>).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }
  if (!messages.every(isChatMessage)) {
    return false;
  }
  const responseFormat = (b.input as Partial<ChatInput>).response_format;
  if (responseFormat !== undefined) {
    if (
      responseFormat === null ||
      typeof responseFormat !== "object" ||
      (responseFormat as { type?: unknown }).type !== "json_object"
    ) {
      return false;
    }
  }
  return true;
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

export interface AiChatBinding {
  run(model: string, input: ChatInput): Promise<{ response?: string }>;
}

export interface AiChatRouteEnv {
  AI: AiChatBinding;
  INTERNAL_API_SECRET: string;
}

export async function handleAiChatRequest(
  request: Request,
  env: AiChatRouteEnv,
): Promise<Response> {
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
  if (!isChatBody(raw)) {
    return new Response(JSON.stringify({ error: "invalid body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const result = await env.AI.run(raw.model, raw.input);
  const responseBody: { response?: string } =
    result.response === undefined ? {} : { response: result.response };
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const INTERNAL_AI_CHAT_PATH = "/internal/ai/chat";
