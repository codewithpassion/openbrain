/**
 * Device-flow record store (RFC 8628).
 *
 * Backed by the same `OAUTH_KV` namespace used by `@cloudflare/workers-oauth-provider`,
 * keyed under two prefixes:
 *
 *   - `device:<device_code>`              → DeviceRecord JSON
 *   - `device_user_code:<user_code>`      → device_code (reverse lookup for the
 *                                            user-facing approval page)
 *
 * KV TTL is set to the device-code expiry so stale records auto-disappear, but
 * `getByDeviceCode` also enforces the expiry in-process for determinism in
 * tests and to guard against KV's eventual-consistency edge cases.
 */

export type DeviceStatus = "pending" | "approved" | "denied";

export interface DeviceRecord {
  deviceCode: string;
  userCode: string;
  clientId: string;
  scope: string;
  expiresAt: number;
  /** Polling interval in seconds. Mutates on slow_down. */
  interval: number;
  /** Last observed poll timestamp in ms epoch. 0 before first poll. */
  lastPollAt: number;
  status: DeviceStatus;
  userId?: string;
  email?: string;
}

export interface CreateInput {
  clientId: string;
  scope?: string;
  expiresInSeconds: number;
  interval: number;
}

export interface CreateResult {
  deviceCode: string;
  userCode: string;
  record: DeviceRecord;
}

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DeviceStore {
  create(input: CreateInput): Promise<CreateResult>;
  getByDeviceCode(deviceCode: string): Promise<DeviceRecord | null>;
  getByUserCode(userCode: string): Promise<{ deviceCode: string; record: DeviceRecord } | null>;
  approve(userCode: string, identity: { userId: string; email?: string }): Promise<void>;
  deny(userCode: string): Promise<void>;
  updatePollState(deviceCode: string, opts: { intervalDelta?: number }): Promise<void>;
  deleteByDeviceCode(deviceCode: string): Promise<void>;
}

const DEVICE_KEY = "device:";
const USER_CODE_KEY = "device_user_code:";

function deviceKey(deviceCode: string): string {
  return `${DEVICE_KEY}${deviceCode}`;
}

function userCodeKey(userCode: string): string {
  return `${USER_CODE_KEY}${userCode}`;
}

/** base64url without padding. */
function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function randomDeviceCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Generate an 8-char A-Z/0-9 user code formatted as XXXX-XXXX. Cryptographically
 * random. Omits visually ambiguous chars (0/O, 1/I/L) per common device-flow UX.
 */
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomUserCode(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    const byte = buf[i];
    if (byte === undefined) {
      throw new Error("unreachable: random buffer underrun");
    }
    const idx = byte % USER_CODE_ALPHABET.length;
    const ch = USER_CODE_ALPHABET[idx];
    if (ch === undefined) {
      throw new Error("unreachable: alphabet index out of range");
    }
    out += ch;
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

interface DeviceStoreOptions {
  kv: KVLike;
  now: () => number;
}

export function createDeviceStore(opts: DeviceStoreOptions): DeviceStore {
  const { kv, now } = opts;

  async function readRecord(deviceCode: string): Promise<DeviceRecord | null> {
    const raw = await kv.get(deviceKey(deviceCode));
    if (raw === null) {
      return null;
    }
    const record = JSON.parse(raw) as DeviceRecord;
    if (record.expiresAt <= now()) {
      return null;
    }
    return record;
  }

  async function writeRecord(record: DeviceRecord): Promise<void> {
    const ttl = Math.max(1, Math.ceil((record.expiresAt - now()) / 1000));
    await kv.put(deviceKey(record.deviceCode), JSON.stringify(record), {
      expirationTtl: ttl,
    });
  }

  return {
    async create(input) {
      const deviceCode = randomDeviceCode();
      const userCode = randomUserCode();
      const record: DeviceRecord = {
        deviceCode,
        userCode,
        clientId: input.clientId,
        scope: input.scope ?? "",
        expiresAt: now() + input.expiresInSeconds * 1000,
        interval: input.interval,
        lastPollAt: 0,
        status: "pending",
      };
      await writeRecord(record);
      await kv.put(userCodeKey(userCode), deviceCode, {
        expirationTtl: input.expiresInSeconds,
      });
      return { deviceCode, userCode, record };
    },

    getByDeviceCode: (deviceCode) => readRecord(deviceCode),

    async getByUserCode(userCode) {
      const deviceCode = await kv.get(userCodeKey(userCode));
      if (deviceCode === null) {
        return null;
      }
      const record = await readRecord(deviceCode);
      if (record === null) {
        return null;
      }
      return { deviceCode, record };
    },

    async approve(userCode, identity) {
      const lookup = await this.getByUserCode(userCode);
      if (lookup === null) {
        throw new DeviceFlowError("not_found", "no device record for user_code");
      }
      const next: DeviceRecord = {
        ...lookup.record,
        status: "approved",
        userId: identity.userId,
        ...(identity.email === undefined ? {} : { email: identity.email }),
      };
      await writeRecord(next);
    },

    async deny(userCode) {
      const lookup = await this.getByUserCode(userCode);
      if (lookup === null) {
        throw new DeviceFlowError("not_found", "no device record for user_code");
      }
      const next: DeviceRecord = { ...lookup.record, status: "denied" };
      await writeRecord(next);
    },

    async updatePollState(deviceCode, optsArg) {
      const record = await readRecord(deviceCode);
      if (record === null) {
        return;
      }
      const next: DeviceRecord = {
        ...record,
        lastPollAt: now(),
        interval: record.interval + (optsArg.intervalDelta ?? 0),
      };
      await writeRecord(next);
    },

    async deleteByDeviceCode(deviceCode) {
      const record = await readRecord(deviceCode);
      await kv.delete(deviceKey(deviceCode));
      if (record !== null) {
        await kv.delete(userCodeKey(record.userCode));
      }
    },
  };
}

export class DeviceFlowError extends Error {
  public readonly code: string;
  public constructor(code: string, message: string) {
    super(message);
    this.name = "DeviceFlowError";
    this.code = code;
  }
}
