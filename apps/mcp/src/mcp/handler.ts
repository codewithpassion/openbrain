import {
  createFakeBrainDumpSplitter,
  createOpenRouterBrainDumpSplitter,
  createOpenRouterMetadataExtractor,
  createWorkersAiBrainDumpSplitter,
  createWorkersAiMetadataExtractor,
  type WorkersAiBinding,
  type WorkersAiChatBinding,
} from "@openbrains/ingest";
import { createMcpHandler } from "agents/mcp";
import type { AuthContext, AuthProps } from "../auth/types";
import { createConvexClient } from "../deps/convex";
import { createEmbedder } from "../deps/embeddings";
import { createVectorizeClient } from "../deps/vectorize";
import type { WorkerEnv } from "../env";
import { buildServer } from "./server";

/**
 * The Cloudflare `AI` binding satisfies both the embedding interface and the
 * chat-completion interface — but our env types it only as the embedding
 * surface. Narrow it at the boundary so the chat-LLM tools can consume it.
 */
function asChatAi(ai: WorkersAiBinding): WorkersAiChatBinding {
  return ai as unknown as WorkersAiChatBinding;
}

interface CtxWithProps {
  props?: unknown;
}

function extractAuth(ctx: CtxWithProps): AuthContext {
  const propsUnknown = ctx.props;
  if (propsUnknown === null || typeof propsUnknown !== "object") {
    return { userId: "" };
  }
  const props = propsUnknown as Partial<AuthProps>;
  if (typeof props.userId !== "string") {
    return { userId: "" };
  }
  return props.email === undefined
    ? { userId: props.userId }
    : { userId: props.userId, email: props.email };
}

/**
 * Per-request factory invoked by the OAuthProvider's apiHandler. Builds the
 * MCP server fresh for the request, threads the userId from the validated
 * OAuth token via `ctx.props` into the tools' auth context.
 */
export interface ApiHandler {
  fetch: (request: Request, env: WorkerEnv, ctx: ExecutionContext) => Promise<Response>;
}

export const mcpApiHandler: ApiHandler = {
  fetch(request, env, ctx) {
    const auth = extractAuth(ctx as unknown as CtxWithProps);
    const opts = env.EMBEDDING_MODEL === undefined ? undefined : { model: env.EMBEDDING_MODEL };
    // Default to Workers AI (the Worker already binds it). OpenRouter remains
    // a configurable fallback for cases where a stronger model is needed —
    // when the key is set, it shadows the Workers AI path. Either way the
    // fake (single-thought passthrough / safe default metadata) is the last
    // resort so tools never throw at runtime.
    const ai = asChatAi(env.AI);
    const openrouterKey = env.OPENROUTER_API_KEY;
    const hasOpenrouter = openrouterKey !== undefined && openrouterKey !== "";
    const metadata = hasOpenrouter
      ? createOpenRouterMetadataExtractor({
          apiKey: openrouterKey,
          fallback: createWorkersAiMetadataExtractor({ ai }),
        })
      : createWorkersAiMetadataExtractor({ ai });
    const splitter = hasOpenrouter
      ? createOpenRouterBrainDumpSplitter({
          apiKey: openrouterKey,
          fallback: createWorkersAiBrainDumpSplitter({
            ai,
            fallback: createFakeBrainDumpSplitter(),
          }),
        })
      : createWorkersAiBrainDumpSplitter({ ai, fallback: createFakeBrainDumpSplitter() });
    const deps = {
      convex: createConvexClient({
        convexUrl: env.CONVEX_URL,
        internalSecret: env.INTERNAL_API_SECRET,
      }),
      vectorize: createVectorizeClient(env.VECTORIZE),
      embeddings: createEmbedder(env.AI, opts),
      metadata,
      splitter,
    };
    const server = buildServer({ deps, auth });
    return createMcpHandler(server, { route: "/mcp" })(request, env, ctx);
  },
};
