import { type Credentials, writeCredentials } from "../auth/credentials-store";
import {
  type FetchLike,
  pollForToken,
  requestDeviceAuthorization,
  type TokenResponse,
} from "../auth/device-flow";
import { DEFAULT_CLIENT_ID } from "../env";
import { emit, emitError } from "../output";

export interface LoginOptions {
  server: string;
  fetch?: FetchLike;
  delay?: (ms: number) => Promise<void>;
  now?: () => number;
  /** If true, suppress the prompt. Used in tests. */
  silent?: boolean;
}

const defaultDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const body = parts[1];
  if (body === undefined) {
    return null;
  }
  try {
    const padded = body.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    const parsed: unknown = JSON.parse(decoded);
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function buildCredentials(server: string, token: TokenResponse, nowMs: number): Credentials {
  const claims = decodeJwtPayload(token.access_token);
  // biome-ignore lint/complexity/useLiteralKeys: JWT claims are an index signature
  const sub = claims?.["sub"];
  const userId = typeof sub === "string" && sub.length > 0 ? sub : "self";
  // biome-ignore lint/complexity/useLiteralKeys: JWT claims are an index signature
  const emailClaim = claims?.["email"];
  const email = typeof emailClaim === "string" && emailClaim.length > 0 ? emailClaim : undefined;
  const expiresAt = nowMs + (token.expires_in === undefined ? 3600_000 : token.expires_in * 1000);
  return {
    server,
    accessToken: token.access_token,
    expiresAt,
    userId,
    ...(token.refresh_token === undefined ? {} : { refreshToken: token.refresh_token }),
    ...(email === undefined ? {} : { email }),
  };
}

export async function runLogin(opts: LoginOptions): Promise<number> {
  const fetchImpl: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const delayImpl = opts.delay ?? defaultDelay;
  const nowImpl = opts.now ?? (() => Date.now());

  const auth = await requestDeviceAuthorization({
    server: opts.server,
    fetch: fetchImpl,
    clientId: DEFAULT_CLIENT_ID,
  });

  if (opts.silent !== true) {
    const uri = auth.verification_uri_complete ?? auth.verification_uri;
    emit("To sign in, visit:");
    emit(`  ${uri}`);
    emit(`And enter the code: ${auth.user_code}`);
    emit("Waiting for authorization...");
  }

  let token: TokenResponse;
  try {
    token = await pollForToken({
      server: opts.server,
      fetch: fetchImpl,
      clientId: DEFAULT_CLIENT_ID,
      deviceCode: auth.device_code,
      initialInterval: auth.interval,
      expiresIn: auth.expires_in,
      delay: delayImpl,
      now: nowImpl,
    });
  } catch (err) {
    emitError(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const creds = buildCredentials(opts.server, token, nowImpl());
  await writeCredentials(creds);

  if (opts.silent !== true) {
    emit(`Signed in as ${creds.email ?? creds.userId}`);
  }
  return 0;
}
