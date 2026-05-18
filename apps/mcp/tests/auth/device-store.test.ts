import { describe, expect, test } from "bun:test";
import { createDeviceStore, type DeviceRecord } from "../../src/auth/device-store";
import { makeFakeKV } from "../helpers/fakes";

function makeStore(opts?: { now?: () => number }) {
  const kv = makeFakeKV();
  const now = opts?.now ?? (() => 1_000_000);
  const store = createDeviceStore({ kv, now });
  return { kv, store };
}

describe("device store", () => {
  test("creates a record and reads it back by device_code and user_code", async () => {
    const { store } = makeStore();
    const created = await store.create({
      clientId: "ob-cli",
      scope: "openid email",
      expiresInSeconds: 900,
      interval: 5,
    });
    expect(created.deviceCode).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(created.deviceCode.length).toBeGreaterThanOrEqual(32);
    expect(created.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const byDevice = await store.getByDeviceCode(created.deviceCode);
    expect(byDevice).not.toBeNull();
    if (byDevice === null) {
      throw new Error("expected record");
    }
    expect(byDevice.clientId).toBe("ob-cli");
    expect(byDevice.status).toBe("pending");
    expect(byDevice.scope).toBe("openid email");
    expect(byDevice.interval).toBe(5);

    const byUser = await store.getByUserCode(created.userCode);
    expect(byUser).not.toBeNull();
    if (byUser === null) {
      throw new Error("expected record");
    }
    expect(byUser.deviceCode).toBe(created.deviceCode);
  });

  test("getByDeviceCode returns null after expiry", async () => {
    let clock = 1_000_000;
    const { store } = makeStore({ now: () => clock });
    const created = await store.create({
      clientId: "ob-cli",
      expiresInSeconds: 10,
      interval: 5,
    });
    clock += 11_000;
    const got = await store.getByDeviceCode(created.deviceCode);
    expect(got).toBeNull();
  });

  test("approve sets status, userId, props and persists for the token grant", async () => {
    const { store } = makeStore();
    const created = await store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    await store.approve(created.userCode, { userId: "user_abc", email: "a@b.com" });
    const got = await store.getByDeviceCode(created.deviceCode);
    if (got === null) {
      throw new Error("expected record");
    }
    expect(got.status).toBe("approved");
    expect(got.userId).toBe("user_abc");
    expect(got.email).toBe("a@b.com");
  });

  test("deny sets status=denied", async () => {
    const { store } = makeStore();
    const created = await store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    await store.deny(created.userCode);
    const got = await store.getByDeviceCode(created.deviceCode);
    if (got === null) {
      throw new Error("expected record");
    }
    expect(got.status).toBe("denied");
  });

  test("updatePollState bumps last_poll_at and optional interval", async () => {
    let clock = 1_000_000;
    const { store } = makeStore({ now: () => clock });
    const created = await store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    clock = 1_005_000;
    await store.updatePollState(created.deviceCode, { intervalDelta: 5 });
    const got = await store.getByDeviceCode(created.deviceCode);
    if (got === null) {
      throw new Error("expected record");
    }
    expect(got.lastPollAt).toBe(1_005_000);
    expect(got.interval).toBe(10);
  });

  test("delete removes both keys", async () => {
    const { store, kv } = makeStore();
    const created = await store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    await store.deleteByDeviceCode(created.deviceCode);
    expect(await store.getByDeviceCode(created.deviceCode)).toBeNull();
    expect(await store.getByUserCode(created.userCode)).toBeNull();
    expect(await kv.get(`device:${created.deviceCode}`)).toBeNull();
    expect(await kv.get(`device_user_code:${created.userCode}`)).toBeNull();
  });

  test("record carries all RFC 8628 fields", async () => {
    const { store } = makeStore({ now: () => 2_000_000 });
    const created = await store.create({
      clientId: "ob-cli",
      expiresInSeconds: 900,
      interval: 5,
    });
    const got = await store.getByDeviceCode(created.deviceCode);
    if (got === null) {
      throw new Error("expected record");
    }
    const record: DeviceRecord = got;
    expect(record.expiresAt).toBe(2_000_000 + 900_000);
    expect(record.userCode).toBe(created.userCode);
    expect(record.lastPollAt).toBe(0);
  });
});
