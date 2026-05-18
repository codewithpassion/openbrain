/**
 * RFC 8628 Device Authorization Grant endpoints + user approval pages.
 *
 * The handler is a tiny Hono app exported as a `handle` function so the entry
 * Worker can mount it both around `OAuthProvider` (for `POST /device_authorization`,
 * `GET /device*`, `POST /device/approve|deny`) and as a pre-filter on
 * `POST /token` to intercept the device-code grant.
 *
 * Token issuance for approved device codes is delegated to an injected
 * `DeviceTokenIssuer`. Production uses an HMAC-signed self-contained bearer
 * (see `device-token.ts`) recognised by the OAuthProvider's
 * `resolveExternalToken` callback: that callback verifies the signature and
 * surfaces `{ userId, email }` as `ctx.props`, exactly the shape the MCP
 * apiHandler reads. We deliberately do NOT round-trip through
 * `OAuthHelpers.completeAuthorization` because `createClient` ignores
 * caller-supplied client ids (see comment in `device-token.ts`).
 *
 * Device-flow tokens carry no `refresh_token`; the CLI falls back to a fresh
 * `ob login` on 401 (see apps/cli/src/mcp-client.ts).
 */

import { Hono } from "hono";
import type { DeviceRecord, DeviceStore } from "./device-store";

const GRANT_TYPE_DEVICE_CODE = "urn:ietf:params:oauth:grant-type:device_code";
const APPROVE_COOKIE = "ob_device_session";

/** Cookie-bound approval identity, signed with HMAC. */
export interface ApproveIdentity {
  userId: string;
  email?: string;
}

export interface DeviceTokenIssuerArgs {
  clientId: string;
  userId: string;
  email?: string;
  scope: string[];
}

export interface DeviceTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export type DeviceTokenIssuer = (args: DeviceTokenIssuerArgs) => Promise<DeviceTokenResponse>;

export interface DeviceFlowDeps {
  store: DeviceStore;
  issuer: DeviceTokenIssuer;
  /** Wall-clock used for poll-interval enforcement (ms epoch). */
  now: () => number;
  /** Public URL where users complete approval, e.g. `https://<host>/device`. */
  verificationBaseUrl: string;
  /** TTL for the post-Clerk-sign-in approval cookie. */
  approveSessionTtlSeconds: number;
  /** HMAC secret for signing approval cookies. */
  sessionSecret: string;
  /** Returned to the CLI in `device_authorization` responses (seconds). */
  deviceCodeTtlSeconds?: number;
  /** Returned to the CLI in `device_authorization` responses (seconds). */
  pollIntervalSeconds?: number;
}

export interface DeviceFlow {
  handle: (request: Request) => Promise<Response>;
  /** Test helper: mints the approve-session cookie a real Clerk callback would set. */
  mintApproveSessionCookie: (identity: ApproveIdentity) => Promise<string>;
}

interface ParsedSession {
  identity: ApproveIdentity;
  expiresAt: number;
}

/* -------------------------------------------------------------------------- */
/* HMAC helpers                                                               */
/* -------------------------------------------------------------------------- */

const encoder = new TextEncoder();

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let s = "";
  for (const b of view) {
    s += String.fromCharCode(b);
  }
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLen));
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function signSession(secret: string, payload: ParsedSession): Promise<string> {
  const key = await importHmacKey(secret);
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toBase64Url(encoder.encode(payloadJson).buffer);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(sig)}`;
}

async function verifySession(
  secret: string,
  token: string,
  now: () => number,
): Promise<ParsedSession | null> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, sigB64] = parts;
  if (payloadB64 === undefined || sigB64 === undefined) {
    return null;
  }
  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(sigB64),
    encoder.encode(payloadB64),
  );
  if (!ok) {
    return null;
  }
  const json = new TextDecoder().decode(fromBase64Url(payloadB64));
  const parsed = JSON.parse(json) as ParsedSession;
  if (parsed.expiresAt <= now()) {
    return null;
  }
  return parsed;
}

function readCookie(header: string | null, name: string): string | null {
  if (header === null) {
    return null;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (trimmed.slice(0, eq) === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* HTML rendering                                                             */
/* -------------------------------------------------------------------------- */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDevicePage(args: {
  userCode: string;
  record: DeviceRecord | null;
  signedIn: boolean;
  email: string | undefined;
}): string {
  const status = args.record === null ? "unknown" : args.record.status;
  const clientId = args.record?.clientId ?? "—";
  const signInButton = args.signedIn
    ? ""
    : `<a class="btn primary" href="/device/start?user_code=${encodeURIComponent(args.userCode)}">Sign in to approve</a>`;
  const approveForm = args.signedIn
    ? `
      <form method="POST" action="/device/approve" class="row">
        <input type="hidden" name="user_code" value="${escapeHtml(args.userCode)}" />
        <button class="btn primary" type="submit">Approve</button>
      </form>
      <form method="POST" action="/device/deny" class="row">
        <input type="hidden" name="user_code" value="${escapeHtml(args.userCode)}" />
        <button class="btn" type="submit">Deny</button>
      </form>`
    : "";
  const whoami =
    args.signedIn && args.email !== undefined
      ? `<p>Signed in as ${escapeHtml(args.email)}.</p>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Approve device — openbrains</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; color: #111; }
    h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
    .code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 2rem; letter-spacing: 0.15em; background: #f4f4f5; padding: 0.75rem 1rem; border-radius: 0.5rem; display: inline-block; }
    .row { display: inline-block; margin-right: 0.5rem; }
    .btn { display: inline-block; padding: 0.6rem 1rem; border-radius: 0.4rem; border: 1px solid #d4d4d8; background: #fafafa; cursor: pointer; text-decoration: none; color: #111; font-size: 1rem; }
    .btn.primary { background: #111; color: #fff; border-color: #111; }
    .muted { color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>Approve device</h1>
  <p class="muted">A device is requesting access to your openbrains memory.</p>
  <p>Device code: <span class="code">${escapeHtml(args.userCode)}</span></p>
  <p class="muted">Status: ${escapeHtml(status)} · Client: ${escapeHtml(clientId)}</p>
  ${whoami}
  ${signInButton}
  ${approveForm}
</body>
</html>`;
}

function renderDeviceLookupPage(): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Enter device code — openbrains</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; }
  input { font: inherit; padding: 0.5rem 0.75rem; border: 1px solid #d4d4d8; border-radius: 0.4rem; width: 100%; box-sizing: border-box; letter-spacing: 0.1em; }
  button { font: inherit; padding: 0.6rem 1rem; border-radius: 0.4rem; border: 1px solid #111; background: #111; color: #fff; cursor: pointer; margin-top: 0.5rem; }
</style></head>
<body>
  <h1>Enter device code</h1>
  <form method="GET" action="/device">
    <input name="user_code" placeholder="XXXX-XXXX" autofocus required />
    <br /><button type="submit">Continue</button>
  </form>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* JSON helpers                                                               */
/* -------------------------------------------------------------------------- */

function jsonResponse(body: unknown, init?: { status?: number; headers?: HeadersInit }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...(init?.headers ?? {}),
    },
  });
}

function htmlResponse(body: string, init?: { status?: number }): Response {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/* -------------------------------------------------------------------------- */
/* The handler                                                                */
/* -------------------------------------------------------------------------- */

export function createDeviceFlow(deps: DeviceFlowDeps): DeviceFlow {
  const app = new Hono();
  const expiresIn = deps.deviceCodeTtlSeconds ?? 900;
  const pollInterval = deps.pollIntervalSeconds ?? 5;

  app.options(
    "/device_authorization",
    () =>
      new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      }),
  );

  app.post("/device_authorization", async (ctx) => {
    const form = await ctx.req.parseBody();
    const clientIdRaw = form["client_id"];
    if (typeof clientIdRaw !== "string" || clientIdRaw === "") {
      return jsonResponse(
        { error: "invalid_request", error_description: "client_id is required" },
        { status: 400 },
      );
    }
    const scopeRaw = form["scope"];
    const scope = typeof scopeRaw === "string" ? scopeRaw : "";
    const created = await deps.store.create({
      clientId: clientIdRaw,
      scope,
      expiresInSeconds: expiresIn,
      interval: pollInterval,
    });
    const verificationUriComplete = `${deps.verificationBaseUrl}?user_code=${encodeURIComponent(created.userCode)}`;
    return jsonResponse({
      device_code: created.deviceCode,
      user_code: created.userCode,
      verification_uri: deps.verificationBaseUrl,
      verification_uri_complete: verificationUriComplete,
      expires_in: expiresIn,
      interval: pollInterval,
    });
  });

  app.post("/token", async (ctx) => {
    const form = await ctx.req.parseBody();
    if (form["grant_type"] !== GRANT_TYPE_DEVICE_CODE) {
      return jsonResponse({ error: "unsupported_grant_type" }, { status: 400 });
    }
    const deviceCode = form["device_code"];
    if (typeof deviceCode !== "string" || deviceCode === "") {
      return jsonResponse(
        { error: "invalid_request", error_description: "device_code is required" },
        { status: 400 },
      );
    }
    return await handleDeviceCodeGrant(deviceCode, deps);
  });

  app.get("/device", async (ctx) => {
    const userCode = ctx.req.query("user_code") ?? "";
    if (userCode === "") {
      return htmlResponse(renderDeviceLookupPage());
    }
    const session = await readSession(ctx.req.raw.headers, deps);
    const lookup = await deps.store.getByUserCode(userCode);
    return htmlResponse(
      renderDevicePage({
        userCode,
        record: lookup === null ? null : lookup.record,
        signedIn: session !== null,
        email: session?.identity.email,
      }),
    );
  });

  app.post("/device/approve", async (ctx) => mutationHandler(ctx.req.raw, deps, "approve"));
  app.post("/device/deny", async (ctx) => mutationHandler(ctx.req.raw, deps, "deny"));

  return {
    handle: async (request) => await app.fetch(request),
    async mintApproveSessionCookie(identity) {
      const payload: ParsedSession = {
        identity,
        expiresAt: deps.now() + deps.approveSessionTtlSeconds * 1000,
      };
      const value = await signSession(deps.sessionSecret, payload);
      return `${APPROVE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${deps.approveSessionTtlSeconds.toString()}`;
    },
  };
}

async function handleDeviceCodeGrant(deviceCode: string, deps: DeviceFlowDeps): Promise<Response> {
  const record = await deps.store.getByDeviceCode(deviceCode);
  if (record === null) {
    return jsonResponse({ error: "expired_token" }, { status: 400 });
  }
  if (record.status === "denied") {
    await deps.store.deleteByDeviceCode(deviceCode);
    return jsonResponse({ error: "access_denied" }, { status: 400 });
  }
  if (record.status === "pending") {
    return await handlePendingPoll(deviceCode, record, deps);
  }
  // status === "approved"
  if (record.userId === undefined) {
    return jsonResponse({ error: "server_error" }, { status: 500 });
  }
  const issuerArgs: DeviceTokenIssuerArgs = {
    clientId: record.clientId,
    userId: record.userId,
    scope: record.scope === "" ? [] : record.scope.split(/\s+/),
    ...(record.email === undefined ? {} : { email: record.email }),
  };
  const token = await deps.issuer(issuerArgs);
  await deps.store.deleteByDeviceCode(deviceCode);
  return jsonResponse(token);
}

async function handlePendingPoll(
  deviceCode: string,
  record: DeviceRecord,
  deps: DeviceFlowDeps,
): Promise<Response> {
  const tooFast =
    record.lastPollAt !== 0 && deps.now() - record.lastPollAt < record.interval * 1000;
  if (tooFast) {
    await deps.store.updatePollState(deviceCode, { intervalDelta: 5 });
    return jsonResponse({ error: "slow_down" }, { status: 400 });
  }
  await deps.store.updatePollState(deviceCode, {});
  return jsonResponse({ error: "authorization_pending" }, { status: 400 });
}

async function readSession(headers: Headers, deps: DeviceFlowDeps): Promise<ParsedSession | null> {
  const cookieHeader = headers.get("cookie");
  const raw = readCookie(cookieHeader, APPROVE_COOKIE);
  if (raw === null) {
    return null;
  }
  return await verifySession(deps.sessionSecret, raw, deps.now);
}

async function mutationHandler(
  request: Request,
  deps: DeviceFlowDeps,
  action: "approve" | "deny",
): Promise<Response> {
  const session = await readSession(request.headers, deps);
  if (session === null) {
    return new Response("unauthorized", { status: 401 });
  }
  const form = await request.formData();
  const userCodeRaw = form.get("user_code");
  if (typeof userCodeRaw !== "string" || userCodeRaw === "") {
    return new Response("user_code required", { status: 400 });
  }
  const lookup = await deps.store.getByUserCode(userCodeRaw);
  if (lookup === null) {
    return new Response("unknown user_code", { status: 404 });
  }
  if (action === "approve") {
    await deps.store.approve(userCodeRaw, session.identity);
  } else {
    await deps.store.deny(userCodeRaw);
  }
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
}

/** Re-exported for the entry module to detect the device-code grant. */
export const DEVICE_CODE_GRANT_TYPE = GRANT_TYPE_DEVICE_CODE;
export const APPROVE_COOKIE_NAME = APPROVE_COOKIE;
