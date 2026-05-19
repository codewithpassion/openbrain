import { createMcpHandler } from "agents/mcp";
import type { AuthContext, AuthProps } from "../auth/types";
import { createConvexClient } from "../deps/convex";
import { createEmbedder } from "../deps/embeddings";
import { createVectorizeClient } from "../deps/vectorize";
import type { WorkerEnv } from "../env";
import { buildServer } from "./server";

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
  async fetch(request, env, ctx) {
    const auth = extractAuth(ctx as unknown as CtxWithProps);
    const opts = env.EMBEDDING_MODEL === undefined ? undefined : { model: env.EMBEDDING_MODEL };
    const deps = {
      convex: createConvexClient({
        convexUrl: env.CONVEX_URL,
        internalSecret: env.INTERNAL_API_SECRET,
      }),
      vectorize: createVectorizeClient(env.VECTORIZE),
      embeddings: createEmbedder(env.AI, opts),
    };
    const server = buildServer({ deps, auth });
    try {
      return await createMcpHandler(server, { route: "/mcp", enableJsonResponse: true })(
        request,
        env,
        ctx,
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          evt: "mcp.err",
          name: err instanceof Error ? err.name : "unknown",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }
  },
};
