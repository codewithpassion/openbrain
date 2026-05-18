import { formatRelativeTime } from "../lib/format";

export interface ApiKeyLike {
  readonly _id: string;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly createdAt: number;
  readonly lastUsedAt?: number | undefined;
  readonly expiresAt?: number | undefined;
}

export interface ApiKeyRowModel {
  readonly id: string;
  readonly name: string;
  readonly scopesLabel: string;
  readonly createdLabel: string;
  readonly lastUsedLabel: string;
}

export function buildApiKeyRowModel(key: ApiKeyLike, now: number = Date.now()): ApiKeyRowModel {
  return {
    id: key._id,
    name: key.name,
    scopesLabel: key.scopes.join(", "),
    createdLabel: formatRelativeTime(key.createdAt, now),
    lastUsedLabel:
      key.lastUsedAt === undefined ? "never used" : formatRelativeTime(key.lastUsedAt, now),
  };
}

/**
 * Mask the body of a raw API key so a stale dialog left open on screen
 * doesn't reveal the full secret. Strings shorter than 8 characters return
 * unchanged — the calling dialog shows the key alongside a copy button on
 * a single mount, so this is purely a defense-in-depth helper.
 */
export function maskRawKey(raw: string): string {
  if (raw.length < 8) {
    return raw;
  }
  const head = raw.slice(0, 4);
  const tail = raw.slice(-4);
  const middle = "•".repeat(Math.max(raw.length - 8, 0));
  return `${head}${middle}${tail}`;
}
