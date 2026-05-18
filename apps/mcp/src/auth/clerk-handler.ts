import type { OAuthHelpers, OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { WorkerEnv } from "../env";
import { createClerkRemoteVerifier } from "./clerk";
import type { AuthProps } from "./types";

/**
 * `defaultHandler` for the OAuthProvider. It owns three routes:
 *
 *   GET /authorize  — redirect the end-user to Clerk hosted sign-in
 *   GET /callback   — receive Clerk's code, exchange + verify the id_token,
 *                     then call `completeAuthorization` to mint our token
 *   GET /           — friendly landing
 *
 * The OAuthProvider wraps this handler with the OAuth endpoints (/token,
 * /register, the well-known docs) automatically.
 */

const STATE_KV_PREFIX = "clerk:state:";
const STATE_TTL_SECONDS = 600;

interface ClerkTokenResponse {
  id_token?: string;
}

/**
 * Factory: callers pass the `OAuthProviderOptions` that the entry module
 * created so we can call `getOAuthApi(options, env)` per request.
 */
export interface DefaultHandler {
  fetch: (request: Request, env: WorkerEnv, ctx: ExecutionContext) => Promise<Response>;
}

export function createClerkHandler(args: {
  oauthOptions: OAuthProviderOptions<WorkerEnv>;
}): DefaultHandler {
  type Variables = { oauth: OAuthHelpers };
  const app = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

  app.use("*", async (ctx, next) => {
    ctx.set("oauth", getOAuthApi(args.oauthOptions, ctx.env));
    await next();
  });

  app.get("/", (ctx) => ctx.text("openbrains-mcp\n"));

  app.get("/authorize", async (ctx) => {
    const oauth = ctx.get("oauth");
    const authReq = await oauth.parseAuthRequest(ctx.req.raw);
    const state = crypto.randomUUID();
    await ctx.env.OAUTH_KV.put(`${STATE_KV_PREFIX}${state}`, JSON.stringify(authReq), {
      expirationTtl: STATE_TTL_SECONDS,
    });
    const url = new URL(ctx.req.url);
    const redirectUri = `${url.origin}/callback`;
    const clerkUrl = new URL(`https://${ctx.env.CLERK_DOMAIN}/oauth/authorize`);
    clerkUrl.searchParams.set("response_type", "code");
    clerkUrl.searchParams.set("client_id", ctx.env.CLERK_CLIENT_ID);
    clerkUrl.searchParams.set("redirect_uri", redirectUri);
    clerkUrl.searchParams.set("scope", "openid email profile");
    clerkUrl.searchParams.set("state", state);
    return ctx.redirect(clerkUrl.toString());
  });

  app.get("/callback", async (ctx) => {
    const code = ctx.req.query("code");
    const state = ctx.req.query("state");
    if (code === undefined || state === undefined) {
      return ctx.text("missing code or state", 400);
    }
    const stored = await ctx.env.OAUTH_KV.get(`${STATE_KV_PREFIX}${state}`);
    if (stored === null) {
      return ctx.text("unknown or expired state", 400);
    }
    await ctx.env.OAUTH_KV.delete(`${STATE_KV_PREFIX}${state}`);
    const authReq = JSON.parse(stored) as Parameters<
      OAuthHelpers["completeAuthorization"]
    >[0]["request"];

    // Exchange the Clerk auth code for an id_token.
    const url = new URL(ctx.req.url);
    const redirectUri = `${url.origin}/callback`;
    const tokenRes = await fetch(`https://${ctx.env.CLERK_DOMAIN}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: ctx.env.CLERK_CLIENT_ID,
        client_secret: ctx.env.CLERK_CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) {
      return ctx.text(`clerk token exchange failed: ${tokenRes.status.toString()}`, 502);
    }
    const tokenJson = (await tokenRes.json()) as ClerkTokenResponse;
    if (typeof tokenJson.id_token !== "string") {
      return ctx.text("clerk did not return an id_token", 502);
    }

    const verifier = createClerkRemoteVerifier({
      jwksUrl: ctx.env.CLERK_JWKS_URL,
      issuer: `https://${ctx.env.CLERK_DOMAIN}`,
    });
    const identity = await verifier.verify(tokenJson.id_token);

    const props: AuthProps =
      identity.email === undefined
        ? { userId: identity.userId }
        : { userId: identity.userId, email: identity.email };

    const { redirectTo } = await ctx.get("oauth").completeAuthorization({
      request: authReq,
      userId: identity.userId,
      metadata: { source: "clerk" },
      scope: authReq.scope ?? [],
      props,
    });
    return ctx.redirect(redirectTo);
  });

  return {
    fetch: async (request, env, ctx) => await app.fetch(request, env, ctx),
  };
}
