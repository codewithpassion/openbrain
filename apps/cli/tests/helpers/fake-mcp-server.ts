/**
 * Minimal in-process fake of the MCP Worker's OAuth endpoints for tests.
 *
 * Implements RFC 8628 surface only — /device_authorization and /token —
 * with scripted responses. Use this through a `FetchLike` injection.
 */

export interface FakeServerOptions {
  baseUrl: string;
  deviceCode?: string;
  userCode?: string;
  /** How many `authorization_pending` responses before granting the token. */
  pendingCount?: number;
  accessToken?: string;
  refreshToken?: string;
  /** When set, the server returns this error instead of granting a token. */
  pollError?: "access_denied" | "expired_token" | "slow_down";
  email?: string;
  userId?: string;
}

export interface FakeServer {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  calls: { url: string; method: string; body: string }[];
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fakeMcpServer(opts: FakeServerOptions): FakeServer {
  const calls: { url: string; method: string; body: string }[] = [];
  const deviceCode = opts.deviceCode ?? "dc_fake_1";
  const userCode = opts.userCode ?? "ABCD-1234";
  const accessToken = opts.accessToken ?? "at_fake";
  const refreshToken = opts.refreshToken ?? "rt_fake";
  let pendingRemaining = opts.pendingCount ?? 0;

  return {
    calls,
    fetch: (url, init) => {
      const body = typeof init.body === "string" ? init.body : "";
      calls.push({ url, method: init.method ?? "GET", body });

      if (url === `${opts.baseUrl}/device_authorization`) {
        return Promise.resolve(
          jsonResponse(200, {
            device_code: deviceCode,
            user_code: userCode,
            verification_uri: `${opts.baseUrl}/device`,
            verification_uri_complete: `${opts.baseUrl}/device?code=${userCode}`,
            expires_in: 600,
            interval: 1,
          }),
        );
      }
      if (url === `${opts.baseUrl}/token`) {
        if (opts.pollError !== undefined) {
          return Promise.resolve(jsonResponse(400, { error: opts.pollError }));
        }
        if (pendingRemaining > 0) {
          pendingRemaining -= 1;
          return Promise.resolve(jsonResponse(400, { error: "authorization_pending" }));
        }
        return Promise.resolve(
          jsonResponse(200, {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: "Bearer",
            expires_in: 3600,
          }),
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    },
  };
}
