/**
 * Shared reader for the dashboard worker's chat-LLM bridge env vars
 * (`DASHBOARD_WORKER_URL` + `INTERNAL_API_SECRET`). Returns either a usable
 * `{ baseUrl, secret }` pair or a `{ skipped }` marker explaining what's
 * missing — callers fold this into their own `{status:"skipped"}` outcome.
 *
 * Mirrors `readWorkerEnv()` in `thoughtsAction.ts` for the vector/embeddings
 * bridge on the MCP Worker; the secret is the same, only the URL differs.
 */

export interface ChatBridgeEnv {
  baseUrl: string;
  secret: string;
}

export function readChatBridgeEnv(): ChatBridgeEnv | { skipped: string } {
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  const baseUrl = process.env["DASHBOARD_WORKER_URL"];
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  const secret = process.env["INTERNAL_API_SECRET"];
  if (baseUrl === undefined || baseUrl === "") {
    return { skipped: "DASHBOARD_WORKER_URL not set" };
  }
  if (secret === undefined || secret === "") {
    return { skipped: "INTERNAL_API_SECRET not set" };
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret };
}
