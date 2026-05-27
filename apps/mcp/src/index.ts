import { OAuthProvider, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { createClerkHandler } from "./auth/clerk-handler";
import { createDeviceFlow, DEVICE_CODE_GRANT_TYPE } from "./auth/device-flow";
import { createDeviceStore } from "./auth/device-store";
import { DEVICE_TOKEN_PREFIX, signDeviceToken, verifyDeviceToken } from "./auth/device-token";
import type { AuthProps } from "./auth/types";
import type { WorkerEnv } from "./env";
import { handleAiRunRequest, INTERNAL_AI_RUN_PATH } from "./internal/ai-route";
import {
  handleVectorDeleteRequest,
  handleVectorUpsertRequest,
  INTERNAL_VECTOR_DELETE_PATH,
  INTERNAL_VECTOR_UPSERT_PATH,
} from "./internal/vector-route";
import { mcpApiHandler } from "./mcp/handler";

const DEVICE_TOKEN_TTL_SECONDS = 3600;
const APPROVE_COOKIE_TTL_SECONDS = 600;

/**
 * The OAuthProvider owns `/authorize`, `/token`, `/register`, and provider
 * metadata. We extend it in two places:
 *
 *   1. `resolveExternalToken` — recognises HMAC-signed device-flow bearers
 *      (`obdev_...`) so the same `apiHandler` sees `ctx.props = { userId }`.
 *
 *   2. A thin pre-filter on `fetch` — intercepts `POST /token` requests whose
 *      `grant_type` is the RFC 8628 device-code grant, AND the user-facing
 *      `POST /device_authorization` + approval endpoints, before they reach
 *      the OAuth provider. Everything else is passed through unchanged.
 *
 * Both extensions share a single HMAC secret (`DEVICE_FLOW_SECRET`) so the
 * token signer (in the pre-filter) and the verifier (in `resolveExternalToken`)
 * agree by construction.
 */

const oauthOptions: OAuthProviderOptions<WorkerEnv> = {
  apiRoute: "/mcp",
  apiHandler: mcpApiHandler,
  defaultHandler: createClerkHandler({
    get oauthOptions(): OAuthProviderOptions<WorkerEnv> {
      return oauthOptions;
    },
  }),
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["openid", "profile", "email"],
  resolveExternalToken: async (input) => {
    if (!input.token.startsWith(DEVICE_TOKEN_PREFIX)) {
      return null;
    }
    const env = input.env as WorkerEnv;
    const claims = await verifyDeviceToken(env.DEVICE_FLOW_SECRET, input.token, () => Date.now());
    if (claims === null) {
      return null;
    }
    const props: AuthProps =
      claims.email === undefined
        ? { userId: claims.userId }
        : { userId: claims.userId, email: claims.email };
    return { props };
  },
};

const provider = new OAuthProvider<WorkerEnv>(oauthOptions);

/**
 * Returns true if this request is the RFC 8628 device-code grant being posted
 * to `/token`. Reads the body off a clone so the original request remains
 * intact for the pass-through path.
 */
async function isDeviceCodeGrant(request: Request): Promise<boolean> {
  if (request.method !== "POST") {
    return false;
  }
  const url = new URL(request.url);
  if (url.pathname !== "/token") {
    return false;
  }
  const cloned = request.clone();
  const form = await cloned.formData();
  return form.get("grant_type") === DEVICE_CODE_GRANT_TYPE;
}

const handler: ExportedHandler<WorkerEnv> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === INTERNAL_AI_RUN_PATH) {
      return await handleAiRunRequest(request, {
        AI: env.AI,
        INTERNAL_API_SECRET: env.INTERNAL_API_SECRET,
      });
    }
    if (url.pathname === INTERNAL_VECTOR_UPSERT_PATH) {
      return await handleVectorUpsertRequest(request, {
        VECTORIZE: env.VECTORIZE,
        INTERNAL_API_SECRET: env.INTERNAL_API_SECRET,
      });
    }
    if (url.pathname === INTERNAL_VECTOR_DELETE_PATH) {
      return await handleVectorDeleteRequest(request, {
        VECTORIZE: env.VECTORIZE,
        INTERNAL_API_SECRET: env.INTERNAL_API_SECRET,
      });
    }
    if (await isDeviceCodeGrant(request)) {
      // Hand the device-code grant to our handler; it owns POST /token for
      // that grant type only.
      const flow = createDeviceFlow({
        store: createDeviceStore({ kv: env.OAUTH_KV, now: () => Date.now() }),
        now: () => Date.now(),
        verificationBaseUrl: `${new URL(request.url).origin}/device`,
        approveSessionTtlSeconds: APPROVE_COOKIE_TTL_SECONDS,
        sessionSecret: env.DEVICE_FLOW_SECRET,
        issuer: async (issArgs) => {
          const now = Math.floor(Date.now() / 1000);
          const accessToken = await signDeviceToken(env.DEVICE_FLOW_SECRET, {
            userId: issArgs.userId,
            ...(issArgs.email === undefined ? {} : { email: issArgs.email }),
            scope: issArgs.scope,
            iat: now,
            exp: now + DEVICE_TOKEN_TTL_SECONDS,
          });
          return {
            access_token: accessToken,
            token_type: "bearer",
            expires_in: DEVICE_TOKEN_TTL_SECONDS,
            scope: issArgs.scope.join(" "),
          };
        },
      });
      return await flow.handle(request);
    }
    return await provider.fetch(request, env, ctx);
  },
};

// biome-ignore lint/style/noDefaultExport: Cloudflare Workers entry requires `export default`.
export default handler;
