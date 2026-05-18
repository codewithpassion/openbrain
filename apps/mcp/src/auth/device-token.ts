/**
 * HMAC-signed self-contained bearer tokens minted for the device-flow path.
 *
 * Why not `OAuthHelpers.completeAuthorization`? Because
 * `@cloudflare/workers-oauth-provider@0.6` always generates a new clientId
 * inside `createClient` (line 1952 of `dist/oauth-provider.js`), so we cannot
 * register the CLI's well-known `ob-cli` client id and round-trip a synthetic
 * authorization code through it.
 *
 * Instead the Worker hands the CLI a token of the form
 *
 *   obdev_<payload_b64url>.<sig_b64url>
 *
 * and the provider's `resolveExternalToken` callback (wired in `src/index.ts`)
 * verifies the HMAC, decodes the payload, and returns the resulting
 * `{ userId, email }` as `props` — populating `ctx.props` on the MCP handler
 * the same way grant-issued tokens would.
 */

const TOKEN_PREFIX = "obdev_";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface DeviceTokenClaims {
  userId: string;
  email?: string;
  scope: readonly string[];
  /** Seconds since epoch. */
  exp: number;
  /** Issued-at, seconds since epoch. */
  iat: number;
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

async function importKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signDeviceToken(secret: string, claims: DeviceTokenClaims): Promise<string> {
  const key = await importKey(secret);
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)).buffer);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${TOKEN_PREFIX}${payload}.${toBase64Url(sig)}`;
}

export async function verifyDeviceToken(
  secret: string,
  token: string,
  now: () => number,
): Promise<DeviceTokenClaims | null> {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const body = token.slice(TOKEN_PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, sigB64] = parts;
  if (payloadB64 === undefined || sigB64 === undefined) {
    return null;
  }
  const key = await importKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(sigB64),
    encoder.encode(payloadB64),
  );
  if (!ok) {
    return null;
  }
  const parsed = JSON.parse(decoder.decode(fromBase64Url(payloadB64))) as DeviceTokenClaims;
  if (parsed.exp * 1000 <= now()) {
    return null;
  }
  return parsed;
}

export const DEVICE_TOKEN_PREFIX = TOKEN_PREFIX;
