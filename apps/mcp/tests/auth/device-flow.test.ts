import { beforeEach, describe, expect, test } from "bun:test";
import {
  createDeviceFlow,
  type DeviceFlowDeps,
  type DeviceTokenIssuer,
} from "../../src/auth/device-flow";
import { createDeviceStore, type DeviceStore } from "../../src/auth/device-store";
import { makeFakeKV } from "../helpers/fakes";

interface IssuerCall {
  clientId: string;
  userId: string;
  scope: string[];
  email?: string;
}

function fakeIssuer(): {
  issuer: DeviceTokenIssuer;
  calls: IssuerCall[];
} {
  const calls: IssuerCall[] = [];
  return {
    calls,
    issuer: (args) => {
      const call: IssuerCall = {
        clientId: args.clientId,
        userId: args.userId,
        scope: [...args.scope],
        ...(args.email === undefined ? {} : { email: args.email }),
      };
      calls.push(call);
      return Promise.resolve({
        access_token: `at_${args.userId}`,
        refresh_token: `rt_${args.userId}`,
        token_type: "bearer",
        expires_in: 3600,
        scope: args.scope.join(" "),
      });
    },
  };
}

interface Harness {
  store: DeviceStore;
  flow: ReturnType<typeof createDeviceFlow>;
  issuerCalls: IssuerCall[];
  clock: { value: number };
}

function makeHarness(overrides?: Partial<DeviceFlowDeps>): Harness {
  const kv = makeFakeKV();
  const clock = { value: 1_000_000 };
  const now = (): number => clock.value;
  const store = createDeviceStore({ kv, now });
  const { issuer, calls } = fakeIssuer();
  const flow = createDeviceFlow({
    store,
    issuer,
    now,
    verificationBaseUrl: "https://ob.example/device",
    approveSessionTtlSeconds: 300,
    sessionSecret: "test-secret-32-bytes-long-enough!",
    ...overrides,
  });
  return { store, flow, issuerCalls: calls, clock };
}

async function postForm(
  flow: ReturnType<typeof createDeviceFlow>,
  path: string,
  body: Record<string, string>,
  init?: { headers?: Record<string, string> },
): Promise<Response> {
  const params = new URLSearchParams(body);
  return await flow.handle(
    new Request(`https://ob.example${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(init?.headers ?? {}),
      },
      body: params.toString(),
    }),
  );
}

describe("POST /device_authorization", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  test("returns RFC 8628 shape with valid user_code regex", async () => {
    const res = await postForm(h.flow, "/device_authorization", {
      client_id: "ob-cli",
      scope: "openid email",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(typeof json["device_code"]).toBe("string");
    expect(typeof json["user_code"]).toBe("string");
    expect(json["verification_uri"]).toBe("https://ob.example/device");
    expect(json["verification_uri_complete"]).toBe(
      `https://ob.example/device?user_code=${json["user_code"] as string}`,
    );
    expect(json["expires_in"]).toBe(900);
    expect(json["interval"]).toBe(5);
    expect(json["user_code"] as string).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  test("missing client_id returns 400 invalid_request", async () => {
    const res = await postForm(h.flow, "/device_authorization", {});
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["error"]).toBe("invalid_request");
  });

  test("CORS headers permit cross-origin device-authorization", async () => {
    const res = await postForm(h.flow, "/device_authorization", { client_id: "ob-cli" });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("POST /token (device_code grant)", () => {
  const GRANT = "urn:ietf:params:oauth:grant-type:device_code";

  test("unknown device_code returns expired_token", async () => {
    const h = makeHarness();
    const res = await postForm(h.flow, "/token", {
      grant_type: GRANT,
      device_code: "does-not-exist",
      client_id: "ob-cli",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["error"]).toBe("expired_token");
  });

  test("pending returns authorization_pending and updates last_poll_at", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    h.clock.value += 60_000;
    const res = await postForm(h.flow, "/token", {
      grant_type: GRANT,
      device_code: created.deviceCode,
      client_id: "ob-cli",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["error"]).toBe("authorization_pending");
    const rec = await h.store.getByDeviceCode(created.deviceCode);
    expect(rec?.lastPollAt).toBe(1_000_000 + 60_000);
  });

  test("polling faster than interval returns slow_down and bumps interval", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    // First poll - allowed (lastPollAt = 0)
    await postForm(h.flow, "/token", {
      grant_type: GRANT,
      device_code: created.deviceCode,
      client_id: "ob-cli",
    });
    // Second poll 1 second later - too fast
    h.clock.value += 1_000;
    const res = await postForm(h.flow, "/token", {
      grant_type: GRANT,
      device_code: created.deviceCode,
      client_id: "ob-cli",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["error"]).toBe("slow_down");
    const rec = await h.store.getByDeviceCode(created.deviceCode);
    expect(rec?.interval).toBe(10);
  });

  test("denied returns access_denied", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    await h.store.deny(created.userCode);
    const res = await postForm(h.flow, "/token", {
      grant_type: GRANT,
      device_code: created.deviceCode,
      client_id: "ob-cli",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["error"]).toBe("access_denied");
  });

  test("approved returns access_token, deletes record, threads scope+email", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      scope: "openid email",
      expiresInSeconds: 900,
      interval: 5,
    });
    await h.store.approve(created.userCode, { userId: "user_abc", email: "a@b.com" });
    const res = await postForm(h.flow, "/token", {
      grant_type: GRANT,
      device_code: created.deviceCode,
      client_id: "ob-cli",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["access_token"]).toBe("at_user_abc");
    expect(json["refresh_token"]).toBe("rt_user_abc");
    expect(json["token_type"]).toBe("bearer");
    expect(json["expires_in"]).toBe(3600);
    expect(h.issuerCalls).toHaveLength(1);
    expect(h.issuerCalls[0]?.userId).toBe("user_abc");
    expect(h.issuerCalls[0]?.email).toBe("a@b.com");
    expect(h.issuerCalls[0]?.scope).toEqual(["openid", "email"]);
    // Record consumed
    expect(await h.store.getByDeviceCode(created.deviceCode)).toBeNull();
  });

  test("expired record returns expired_token", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      expiresInSeconds: 10,
      interval: 5,
    });
    h.clock.value += 11_000;
    const res = await postForm(h.flow, "/token", {
      grant_type: GRANT,
      device_code: created.deviceCode,
      client_id: "ob-cli",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["error"]).toBe("expired_token");
  });
});

describe("approval flow", () => {
  test("GET /device with user_code shows approve form and pre-fills code", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    const res = await h.flow.handle(
      new Request(`https://ob.example/device?user_code=${created.userCode}`),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(created.userCode);
    expect(body.toLowerCase()).toContain("approve");
  });

  test("POST /device/approve without session cookie returns 401", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    const res = await postForm(h.flow, "/device/approve", {
      user_code: created.userCode,
    });
    expect(res.status).toBe(401);
  });

  test("POST /device/approve with valid session sets status=approved", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    const cookie = await h.flow.mintApproveSessionCookie({
      userId: "user_xyz",
      email: "x@y.com",
    });
    const res = await postForm(
      h.flow,
      "/device/approve",
      { user_code: created.userCode },
      { headers: { cookie } },
    );
    expect(res.status).toBe(200);
    const rec = await h.store.getByDeviceCode(created.deviceCode);
    expect(rec?.status).toBe("approved");
    expect(rec?.userId).toBe("user_xyz");
    expect(rec?.email).toBe("x@y.com");
  });

  test("POST /device/deny with valid session marks denied", async () => {
    const h = makeHarness();
    const created = await h.store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    const cookie = await h.flow.mintApproveSessionCookie({ userId: "user_xyz" });
    const res = await postForm(
      h.flow,
      "/device/deny",
      { user_code: created.userCode },
      { headers: { cookie } },
    );
    expect(res.status).toBe(200);
    const rec = await h.store.getByDeviceCode(created.deviceCode);
    expect(rec?.status).toBe("denied");
  });

  test("POST /device/approve rejects unknown user_code", async () => {
    const h = makeHarness();
    const cookie = await h.flow.mintApproveSessionCookie({ userId: "user_xyz" });
    const res = await postForm(
      h.flow,
      "/device/approve",
      { user_code: "ZZZZ-ZZZZ" },
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });
});
