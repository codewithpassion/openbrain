/**
 * HTTP-backed chat client for the Workers AI binding shape. Used by Convex
 * actions (and any other non-Worker caller) to invoke chat-completion models
 * via a CF Worker that exposes `/internal/ai/chat` and proxies to its native
 * `AI` binding. Protected by the shared `INTERNAL_API_SECRET` header — the
 * Worker validates timing-safely.
 *
 * Structurally identical to the native `WorkersAiChatBinding`, so it composes
 * with `createWorkersAiMetadataExtractor`, `createWorkersAiBrainDumpSplitter`,
 * and the new `createWorkersAiEntityExtractor` exactly like the native binding.
 */

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const SECRET_HEADER = "x-openbrains-internal-secret";

export interface WorkersAiChatInput {
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
  readonly response_format?: { readonly type: "json_object" };
}

export interface WorkersAiChatBinding {
  run(model: string, input: WorkersAiChatInput): Promise<{ readonly response?: string }>;
}

export interface WorkersAiHttpChatClientOptions {
  /** Worker origin without trailing slash, e.g. `https://ob-dashboard.example.com`. */
  baseUrl: string;
  /** Shared secret matching the Worker's `INTERNAL_API_SECRET`. */
  internalSecret: string;
  /** Optional path override; default `/internal/ai/chat`. */
  path?: string;
  fetch?: FetchLike;
}

export class WorkersAiChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkersAiChatError";
  }
}

interface WorkersAiHttpChatResponse {
  response?: string;
}

export function createWorkersAiHttpChatClient(
  options: WorkersAiHttpChatClientOptions,
): WorkersAiChatBinding {
  const base = options.baseUrl.replace(/\/$/, "");
  const path = options.path ?? "/internal/ai/chat";
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  return {
    async run(model, input) {
      const response = await doFetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [SECRET_HEADER]: options.internalSecret,
        },
        body: JSON.stringify({ model, input }),
      });
      if (!response.ok) {
        throw new WorkersAiChatError(`workers-ai chat call failed: ${response.status.toString()}`);
      }
      const body = (await response.json()) as WorkersAiHttpChatResponse;
      if (typeof body !== "object" || body === null) {
        throw new WorkersAiChatError("workers-ai chat response is not an object");
      }
      if (body.response !== undefined && typeof body.response !== "string") {
        throw new WorkersAiChatError("workers-ai chat response.response is not a string");
      }
      return body.response === undefined ? {} : { response: body.response };
    },
  };
}
