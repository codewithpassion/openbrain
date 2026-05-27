/**
 * Custom Worker entry point for the dashboard.
 *
 * The default `@tanstack/react-start/server-entry` is a thin shim around
 * `createStartHandler(defaultStreamHandler)`. We replace it with this entry so
 * we can intercept `/internal/ai/chat` (the server-to-server bridge that lets
 * Convex actions call the dashboard's `AI` binding for chat-completion models)
 * and fall through to TanStack Start for every other route.
 */
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import {
  type AiChatBinding,
  handleAiChatRequest,
  INTERNAL_AI_CHAT_PATH,
} from "./server/internal-ai-chat-route";

const tanstackFetch = createStartHandler(defaultStreamHandler);

interface DashboardWorkerEnv {
  AI: AiChatBinding;
  INTERNAL_API_SECRET: string;
}

export default {
  async fetch(request: Request, env: DashboardWorkerEnv, ...rest: unknown[]): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === INTERNAL_AI_CHAT_PATH) {
      return handleAiChatRequest(request, env);
    }
    // Forward `env` + any remaining args (ctx) to TanStack so server functions
    // that consume them keep working. The default entry forwards all args.
    return await (tanstackFetch as (...args: unknown[]) => Promise<Response>)(
      request,
      env,
      ...rest,
    );
  },
};
