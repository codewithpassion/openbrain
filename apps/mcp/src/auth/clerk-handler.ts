import type { OAuthHelpers, OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { WorkerEnv } from "../env";
import { createClerkRemoteVerifier } from "./clerk";
import { createDeviceFlow, type DeviceFlow } from "./device-flow";
import { createDeviceStore } from "./device-store";
import { signDeviceToken } from "./device-token";
import type { AuthProps } from "./types";

/**
 * `defaultHandler` for the OAuthProvider. It owns:
 *
 *   GET  /authorize          — redirect the end-user to Clerk hosted sign-in
 *                              (for the standard OAuth 2.1 authorization-code flow)
 *   GET  /callback           — receive Clerk's code, exchange + verify the id_token,
 *                              then either:
 *                              • call `completeAuthorization` (default flow), OR
 *                              • set the device-approve session cookie and
 *                                redirect back to /device?user_code=...
 *                                (when state.intent === "device_approve")
 *   GET  /device, /device/start
 *   POST /device_authorization, /device/approve, /device/deny
 *                            — RFC 8628 device-flow surface; delegated to `device-flow.ts`.
 *   GET  /                    — friendly landing
 *
 * `POST /token` is owned by the OAuthProvider for the authorization-code grant,
 * and intercepted upstream of the provider (in `src/index.ts`) for the
 * device-code grant.
 */

const STATE_KV_PREFIX = "clerk:state:";
const STATE_TTL_SECONDS = 600;

const DEVICE_TOKEN_TTL_SECONDS = 3600;
const APPROVE_COOKIE_TTL_SECONDS = 600;

interface ClerkTokenResponse {
  id_token?: string;
}

// Build the public-facing callback URL. Behind a TLS-terminating proxy
// (cloudflared tunnels, Cloudflare's edge) the request reaches the Worker
// over plain HTTP, so `new URL(req.url).protocol` is "http:". The real public
// scheme is in X-Forwarded-Proto; honour it so the redirect_uri we send to
// Clerk matches the URL Clerk will redirect the user back to.
function publicCallbackUri(reqUrl: string, forwardedProto: string | undefined): string {
  const url = new URL(reqUrl);
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  return `${proto}://${url.host}/callback`;
}

interface StoredState {
  authReq?: Parameters<OAuthHelpers["completeAuthorization"]>[0]["request"];
  intent?: "device_approve";
  userCode?: string;
}

export interface DefaultHandler {
  fetch: (request: Request, env: WorkerEnv, ctx: ExecutionContext) => Promise<Response>;
}

interface CreateClerkHandlerArgs {
  oauthOptions: OAuthProviderOptions<WorkerEnv>;
}

export function createClerkHandler(args: CreateClerkHandlerArgs): DefaultHandler {
  type Variables = { oauth: OAuthHelpers; device: DeviceFlow };
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

  app.use("*", async (ctx, next) => {
    ctx.set("oauth", getOAuthApi(args.oauthOptions, ctx.env));
    ctx.set("device", createDeviceFlowForEnv(ctx.env, ctx.req.url));
    await next();
  });

  // Forgiveness: MCP clients given the bare host URL (without `/mcp`) POST
  // JSON-RPC straight to `/`. A 404 here surfaces in Claude as a generic
  // "Authorization with the MCP server failed". Redirect to the real endpoint
  // with 307 so method, body, and Authorization header are preserved. GET/HEAD
  // get a human-readable landing.
  app.all("/", (ctx) => {
    if (ctx.req.method === "GET" || ctx.req.method === "HEAD") {
      const url = new URL(ctx.req.url);
      return ctx.text(
        `openbrains-mcp\n\nMCP endpoint: ${url.origin}/mcp\nPoint your MCP client at that URL.\n`,
      );
    }
    const url = new URL(ctx.req.url);
    url.pathname = "/mcp";
    return ctx.redirect(url.toString(), 307);
  });

  // -----------------------------------------------------------------
  // Device-flow surface — delegated.
  // -----------------------------------------------------------------
  const deviceRouteMatchers: { method: string; path: RegExp }[] = [
    { method: "POST", path: /^\/device_authorization$/ },
    { method: "POST", path: /^\/device\/approve$/ },
    { method: "POST", path: /^\/device\/deny$/ },
    { method: "GET", path: /^\/device$/ },
    { method: "OPTIONS", path: /^\/device_authorization$/ },
  ];
  app.use("*", async (ctx, next) => {
    const url = new URL(ctx.req.url);
    const isDeviceRoute = deviceRouteMatchers.some(
      (m) => m.method === ctx.req.method && m.path.test(url.pathname),
    );
    if (!isDeviceRoute) {
      await next();
      return;
    }
    const response = await ctx.get("device").handle(ctx.req.raw);
    ctx.res = response;
  });

  // -----------------------------------------------------------------
  // GET /device/start — redirect to Clerk to obtain identity for the
  // device-approve flow.
  // -----------------------------------------------------------------
  app.get("/device/start", async (ctx) => {
    const userCode = ctx.req.query("user_code");
    if (userCode === undefined || userCode === "") {
      return ctx.text("missing user_code", 400);
    }
    const state = crypto.randomUUID();
    const stored: StoredState = { intent: "device_approve", userCode };
    await ctx.env.OAUTH_KV.put(`${STATE_KV_PREFIX}${state}`, JSON.stringify(stored), {
      expirationTtl: STATE_TTL_SECONDS,
    });
    const redirectUri = publicCallbackUri(ctx.req.url, ctx.req.header("x-forwarded-proto"));
    const clerkUrl = new URL(`https://${ctx.env.CLERK_DOMAIN}/oauth/authorize`);
    clerkUrl.searchParams.set("response_type", "code");
    clerkUrl.searchParams.set("client_id", ctx.env.CLERK_CLIENT_ID);
    clerkUrl.searchParams.set("redirect_uri", redirectUri);
    clerkUrl.searchParams.set("scope", "openid email profile");
    clerkUrl.searchParams.set("state", state);
    return ctx.redirect(clerkUrl.toString());
  });

  // -----------------------------------------------------------------
  // Standard OAuth authorization-code redirect to Clerk.
  // -----------------------------------------------------------------
  app.get("/authorize", async (ctx) => {
    const oauth = ctx.get("oauth");
    const authReq = await oauth.parseAuthRequest(ctx.req.raw);
    const state = crypto.randomUUID();
    const stored: StoredState = { authReq };
    await ctx.env.OAUTH_KV.put(`${STATE_KV_PREFIX}${state}`, JSON.stringify(stored), {
      expirationTtl: STATE_TTL_SECONDS,
    });
    const redirectUri = publicCallbackUri(ctx.req.url, ctx.req.header("x-forwarded-proto"));
    const clerkUrl = new URL(`https://${ctx.env.CLERK_DOMAIN}/oauth/authorize`);
    clerkUrl.searchParams.set("response_type", "code");
    clerkUrl.searchParams.set("client_id", ctx.env.CLERK_CLIENT_ID);
    clerkUrl.searchParams.set("redirect_uri", redirectUri);
    clerkUrl.searchParams.set("scope", "openid email profile");
    clerkUrl.searchParams.set("state", state);
    return ctx.redirect(clerkUrl.toString());
  });

  // -----------------------------------------------------------------
  // Clerk callback — branches on stored intent.
  // -----------------------------------------------------------------
  app.get("/callback", async (ctx) => {
    const code = ctx.req.query("code");
    const state = ctx.req.query("state");
    if (code === undefined || state === undefined) {
      return ctx.text("missing code or state", 400);
    }
    const stored = await consumeState(ctx.env, state);
    if (stored === null) {
      return ctx.text("unknown or expired state", 400);
    }
    const redirectUri = publicCallbackUri(ctx.req.url, ctx.req.header("x-forwarded-proto"));
    const identity = await exchangeClerkCode(redirectUri, ctx.env, code);
    if (identity === null) {
      return ctx.text("clerk token exchange failed", 502);
    }
    if (stored.intent === "device_approve") {
      const cookie = await ctx.get("device").mintApproveSessionCookie(identity);
      return deviceApproveRedirect(cookie, stored.userCode);
    }
    if (stored.authReq === undefined) {
      return ctx.text("invalid state: missing authReq", 400);
    }
    const { redirectTo } = await ctx
      .get("oauth")
      .completeAuthorization(buildAuthCompletion(stored.authReq, identity));
    return ctx.redirect(redirectTo);
  });

  return {
    fetch: async (request, env, ctx) => await app.fetch(request, env, ctx),
  };
}

async function consumeState(env: WorkerEnv, state: string): Promise<StoredState | null> {
  const raw = await env.OAUTH_KV.get(`${STATE_KV_PREFIX}${state}`);
  if (raw === null) {
    return null;
  }
  await env.OAUTH_KV.delete(`${STATE_KV_PREFIX}${state}`);
  return JSON.parse(raw) as StoredState;
}

function deviceApproveRedirect(cookie: string, userCode: string | undefined): Response {
  const userCodeParam = userCode === undefined ? "" : `?user_code=${encodeURIComponent(userCode)}`;
  return new Response(null, {
    status: 302,
    headers: { location: `/device${userCodeParam}`, "set-cookie": cookie },
  });
}

function buildAuthCompletion(
  authReq: NonNullable<StoredState["authReq"]>,
  identity: { userId: string; email?: string },
): Parameters<OAuthHelpers["completeAuthorization"]>[0] {
  const props: AuthProps =
    identity.email === undefined
      ? { userId: identity.userId }
      : { userId: identity.userId, email: identity.email };
  return {
    request: authReq,
    userId: identity.userId,
    metadata: { source: "clerk" },
    scope: authReq.scope ?? [],
    props,
  };
}

/**
 * Exchanges a Clerk auth code for an `id_token` and verifies it. Returns the
 * resolved Clerk identity or `null` if the exchange/verify failed.
 */
async function exchangeClerkCode(
  redirectUri: string,
  env: WorkerEnv,
  code: string,
): Promise<{ userId: string; email?: string } | null> {
  const tokenRes = await fetch(`https://${env.CLERK_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: env.CLERK_CLIENT_ID,
      client_secret: env.CLERK_CLIENT_SECRET,
    }),
  });
  if (!tokenRes.ok) {
    return null;
  }
  const tokenJson = (await tokenRes.json()) as ClerkTokenResponse;
  if (typeof tokenJson.id_token !== "string") {
    return null;
  }
  const verifier = createClerkRemoteVerifier({
    jwksUrl: env.CLERK_JWKS_URL,
    issuer: `https://${env.CLERK_DOMAIN}`,
  });
  return await verifier.verify(tokenJson.id_token);
}

/**
 * Build a `DeviceFlow` bound to the per-request env. The verification URL
 * mirrors the request origin so the value the CLI receives is the URL the user
 * actually visits.
 */
function createDeviceFlowForEnv(env: WorkerEnv, requestUrl: string): DeviceFlow {
  const origin = new URL(requestUrl).origin;
  const store = createDeviceStore({
    kv: env.OAUTH_KV,
    now: () => Date.now(),
  });
  return createDeviceFlow({
    store,
    now: () => Date.now(),
    verificationBaseUrl: `${origin}/device`,
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
}
