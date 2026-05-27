/**
 * Per-user default scope persisted in OAUTH_KV under a distinct prefix.
 *
 * Why OAUTH_KV: the Worker already has it bound, and the `session-scope:`
 * prefix avoids collision with the OAuthProvider's own keys (`grant:`,
 * `client:`, etc.) and with the device-flow keys (`device:`) and the
 * clerk-handler's `state:` keys.
 *
 * Why keyed by userId (not the bearer token): we have userId in every tool
 * envelope; reaching the bearer requires plumbing through `resolveExternalToken`
 * and the OAuth grant boundary. Keyed by userId means a user's connected AI
 * clients share the same default — a deliberate trade for "set it once,
 * recall everywhere" ergonomics. Per-client granularity is a future option.
 */

const KV_PREFIX = "session-scope:";

/**
 * Minimal KV surface we use. Matches `@cloudflare/workers-types` `KVNamespace`
 * for the methods we call, but stays structural so tests can fake it.
 */
export interface SessionScopeKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SessionScopeStore {
  get(userId: string): Promise<string | null>;
  set(userId: string, scope: string | null): Promise<void>;
}

export function createSessionScopeStore(kv: SessionScopeKV): SessionScopeStore {
  function key(userId: string): string {
    return `${KV_PREFIX}${userId}`;
  }
  return {
    get: (userId) => kv.get(key(userId)),
    set: async (userId, scope) => {
      if (scope === null) {
        await kv.delete(key(userId));
        return;
      }
      await kv.put(key(userId), scope);
    },
  };
}

/**
 * If `rawInput` is an object that doesn't already carry a `scope`, splice in
 * the user's pinned default (if any). Tool-supplied `scope` always wins; we
 * never overwrite a value the caller provided.
 *
 * Non-object inputs are returned unchanged — the downstream Zod parse will
 * reject them with the right error.
 */
export async function withSessionDefaultScope(
  rawInput: unknown,
  store: SessionScopeStore | undefined,
  userId: string,
): Promise<unknown> {
  if (store === undefined || userId === "" || rawInput === null || typeof rawInput !== "object") {
    return rawInput;
  }
  const obj = rawInput as Record<string, unknown>;
  // biome-ignore lint/complexity/useLiteralKeys: index-signature read requires brackets under noPropertyAccessFromIndexSignature
  if (obj["scope"] !== undefined) {
    return rawInput;
  }
  const pinned = await store.get(userId);
  if (pinned === null) {
    return rawInput;
  }
  return { ...obj, scope: pinned };
}
