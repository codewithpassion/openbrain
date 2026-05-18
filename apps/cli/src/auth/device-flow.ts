/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628) client.
 *
 * Pure I/O: fetch, delay, now are all injected.
 */
import { z } from "zod";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const deviceAuthorizationResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().min(1),
  verification_uri_complete: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().default(5),
});
export type DeviceAuthorizationResponse = z.infer<typeof deviceAuthorizationResponseSchema>;

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export interface RequestDeviceAuthorizationInput {
  server: string;
  fetch: FetchLike;
  clientId: string;
  scope?: string;
}

export async function requestDeviceAuthorization(
  input: RequestDeviceAuthorizationInput,
): Promise<DeviceAuthorizationResponse> {
  const body = new URLSearchParams();
  body.set("client_id", input.clientId);
  if (input.scope !== undefined) {
    body.set("scope", input.scope);
  }
  const response = await input.fetch(`${input.server}/device_authorization`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(
      `device_authorization failed: ${String(response.status)} ${await response.text()}`,
    );
  }
  const json: unknown = await response.json();
  return deviceAuthorizationResponseSchema.parse(json);
}

export interface PollForTokenInput {
  server: string;
  fetch: FetchLike;
  clientId: string;
  deviceCode: string;
  initialInterval: number; // seconds
  expiresIn: number; // seconds
  delay: (ms: number) => Promise<void>;
  now: () => number; // ms epoch (or any monotonic ms, used relative to start)
}

const errorResponseSchema = z.object({ error: z.string().min(1) });

const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export async function pollForToken(input: PollForTokenInput): Promise<TokenResponse> {
  const start = input.now();
  const expiresAt = start + input.expiresIn * 1000;
  let interval = input.initialInterval;
  let firstAttempt = true;

  while (true) {
    if (!firstAttempt) {
      await input.delay(interval * 1000);
      if (input.now() >= expiresAt) {
        throw new Error("device code expired before authorization completed");
      }
    }
    firstAttempt = false;

    const body = new URLSearchParams();
    body.set("grant_type", GRANT_TYPE);
    body.set("device_code", input.deviceCode);
    body.set("client_id", input.clientId);
    const response = await input.fetch(`${input.server}/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
    });

    if (response.ok) {
      const json: unknown = await response.json();
      return tokenResponseSchema.parse(json);
    }

    let parsedError: { error: string };
    try {
      const errJson: unknown = await response.json();
      parsedError = errorResponseSchema.parse(errJson);
    } catch {
      throw new Error(`token endpoint returned ${String(response.status)} without an error code`);
    }

    switch (parsedError.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        interval += 5;
        continue;
      case "access_denied":
        throw new Error("access_denied: user declined the authorization request");
      case "expired_token":
        throw new Error("expired_token: device code expired before authorization completed");
      default:
        throw new Error(`token endpoint error: ${parsedError.error}`);
    }
  }
}
