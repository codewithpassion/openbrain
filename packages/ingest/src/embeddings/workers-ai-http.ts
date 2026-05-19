/**
 * HTTP-backed `WorkersAiBinding` impl used by callers that don't have the
 * native `AI` binding (e.g., Convex actions). Talks to the MCP Worker's
 * `/internal/ai/run` route, which is protected by the shared
 * `INTERNAL_API_SECRET` header.
 *
 * Once constructed, it is structurally identical to a real Workers AI
 * binding, so it composes with `createWorkersAiEmbedder` exactly like the
 * native binding does.
 */
import { EmbeddingError } from "./types";
import type { WorkersAiBinding } from "./workers-ai";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const SECRET_HEADER = "x-openbrains-internal-secret";

interface WorkersAiHttpClientOptions {
  /** Worker origin without trailing slash, e.g. `https://ob-mcp.example.com`. */
  baseUrl: string;
  /** Shared secret matching the Worker's `INTERNAL_API_SECRET`. */
  internalSecret: string;
  /** Optional path override; default `/internal/ai/run`. */
  path?: string;
  fetch?: FetchLike;
}

interface WorkersAiHttpResponse {
  data?: readonly (readonly number[])[];
}

export function createWorkersAiHttpClient(options: WorkersAiHttpClientOptions): WorkersAiBinding {
  const base = options.baseUrl.replace(/\/$/, "");
  const path = options.path ?? "/internal/ai/run";
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
        throw new EmbeddingError(`workers-ai http call failed: ${response.status.toString()}`);
      }
      const body = (await response.json()) as WorkersAiHttpResponse;
      if (!Array.isArray(body.data)) {
        throw new EmbeddingError("workers-ai http response missing data array");
      }
      return { data: body.data };
    },
  };
}
