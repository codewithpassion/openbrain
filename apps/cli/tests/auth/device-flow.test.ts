import { describe, expect, test } from "bun:test";
import {
  type DeviceAuthorizationResponse,
  pollForToken,
  requestDeviceAuthorization,
} from "../../src/auth/device-flow";

type FetchCall = { url: string; init: RequestInit };

interface FakeServer {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  calls: FetchCall[];
}

function makeFakeFetch(responses: (() => Response)[]): {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let i = 0;
  return {
    calls,
    fetch: (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const make = responses[i];
      i++;
      if (make === undefined) {
        throw new Error(`unexpected fetch call #${i} to ${url}`);
      }
      return Promise.resolve(make());
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const deviceAuthBody: DeviceAuthorizationResponse = {
  device_code: "dc_abc",
  user_code: "WXYZ-1234",
  verification_uri: "https://ob.example/device",
  verification_uri_complete: "https://ob.example/device?code=WXYZ-1234",
  expires_in: 600,
  interval: 5,
};

function makeServer(responses: (() => Response)[]): FakeServer {
  return makeFakeFetch(responses);
}

describe("requestDeviceAuthorization", () => {
  test("POSTs form-encoded to /device_authorization and parses response", async () => {
    const server = makeServer([() => jsonResponse(200, deviceAuthBody)]);
    const result = await requestDeviceAuthorization({
      server: "https://ob.example",
      fetch: server.fetch,
      clientId: "cli",
    });
    expect(result.device_code).toBe("dc_abc");
    expect(result.user_code).toBe("WXYZ-1234");
    expect(server.calls).toHaveLength(1);
    const call = server.calls[0];
    if (call === undefined) {
      throw new Error("missing call");
    }
    expect(call.url).toBe("https://ob.example/device_authorization");
    expect(call.init.method).toBe("POST");
    const headers = new Headers(call.init.headers);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(typeof call.init.body).toBe("string");
    const params = new URLSearchParams(call.init.body as string);
    expect(params.get("client_id")).toBe("cli");
  });

  test("throws on non-2xx response", async () => {
    const server = makeServer([() => jsonResponse(400, { error: "invalid_request" })]);
    await expect(
      requestDeviceAuthorization({
        server: "https://ob.example",
        fetch: server.fetch,
        clientId: "cli",
      }),
    ).rejects.toThrow();
  });
});

describe("pollForToken", () => {
  const baseInput = {
    server: "https://ob.example",
    deviceCode: "dc_abc",
    clientId: "cli",
    initialInterval: 5,
    expiresIn: 600,
  } as const;

  test("returns access token on first success", async () => {
    const server = makeServer([
      () =>
        jsonResponse(200, {
          access_token: "at_1",
          refresh_token: "rt_1",
          token_type: "Bearer",
          expires_in: 3600,
        }),
    ]);
    const delays: number[] = [];
    const result = await pollForToken({
      ...baseInput,
      fetch: server.fetch,
      delay: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    expect(result.access_token).toBe("at_1");
    expect(result.refresh_token).toBe("rt_1");
  });

  test("retries on authorization_pending until success", async () => {
    const server = makeServer([
      () => jsonResponse(400, { error: "authorization_pending" }),
      () => jsonResponse(400, { error: "authorization_pending" }),
      () =>
        jsonResponse(200, {
          access_token: "at_2",
          token_type: "Bearer",
          expires_in: 3600,
        }),
    ]);
    const delays: number[] = [];
    const result = await pollForToken({
      ...baseInput,
      fetch: server.fetch,
      delay: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    expect(result.access_token).toBe("at_2");
    expect(server.calls.length).toBe(3);
    // delays should be applied before each retry: 5s, 5s
    expect(delays).toEqual([5000, 5000]);
  });

  test("increases interval by 5 seconds on slow_down", async () => {
    const server = makeServer([
      () => jsonResponse(400, { error: "slow_down" }),
      () => jsonResponse(400, { error: "authorization_pending" }),
      () =>
        jsonResponse(200, {
          access_token: "at_3",
          token_type: "Bearer",
          expires_in: 3600,
        }),
    ]);
    const delays: number[] = [];
    await pollForToken({
      ...baseInput,
      fetch: server.fetch,
      delay: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    // first delay: 5+5 = 10s (slow_down bumped), then 10s (no more bump on pending)
    expect(delays).toEqual([10_000, 10_000]);
  });

  test("throws on access_denied", async () => {
    const server = makeServer([() => jsonResponse(400, { error: "access_denied" })]);
    await expect(
      pollForToken({
        ...baseInput,
        fetch: server.fetch,
        delay: () => Promise.resolve(),
        now: () => 0,
      }),
    ).rejects.toThrow(/access_denied/);
  });

  test("throws on expired_token", async () => {
    const server = makeServer([() => jsonResponse(400, { error: "expired_token" })]);
    await expect(
      pollForToken({
        ...baseInput,
        fetch: server.fetch,
        delay: () => Promise.resolve(),
        now: () => 0,
      }),
    ).rejects.toThrow(/expired_token/);
  });

  test("throws when polling exceeds expires_in window", async () => {
    // server says pending; after the first delay (5s) the clock is past expiresIn (4s)
    const server = makeServer([() => jsonResponse(400, { error: "authorization_pending" })]);
    let t = 0;
    await expect(
      pollForToken({
        ...baseInput,
        expiresIn: 4,
        fetch: server.fetch,
        delay: (ms) => {
          t += ms;
          return Promise.resolve();
        },
        now: () => t,
      }),
    ).rejects.toThrow(/expired/);
  });
});
