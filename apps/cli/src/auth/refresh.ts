import type { FetchLike, TokenResponse } from "./device-flow";
import { tokenResponseSchema } from "./device-flow";

export interface RefreshInput {
  server: string;
  fetch: FetchLike;
  clientId: string;
  refreshToken: string;
}

export async function refreshAccessToken(input: RefreshInput): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", input.refreshToken);
  body.set("client_id", input.clientId);

  const response = await input.fetch(`${input.server}/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`token refresh failed: ${String(response.status)} ${await response.text()}`);
  }
  const json: unknown = await response.json();
  return tokenResponseSchema.parse(json);
}
