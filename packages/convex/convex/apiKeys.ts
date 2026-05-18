import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { writeAudit } from "./_lib/audit.js";
import { requireUserId } from "./_lib/identity.js";

const RAW_KEY_BYTES = 32;

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(digest));
}

export const mint = mutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const raw = new Uint8Array(RAW_KEY_BYTES);
    crypto.getRandomValues(raw);
    const rawKey = bytesToBase64Url(raw);
    const hash = await sha256Hex(rawKey);
    const row: {
      userId: string;
      hash: string;
      name: string;
      scopes: string[];
      createdAt: number;
      expiresAt?: number;
    } = {
      userId,
      hash,
      name: args.name,
      scopes: args.scopes,
      createdAt: Date.now(),
    };
    if (args.expiresAt !== undefined) {
      row.expiresAt = args.expiresAt;
    }
    const id = await ctx.db.insert("api_keys", row);
    await writeAudit(ctx, {
      userId,
      action: "apiKey.mint",
      actor: userId,
      diff: { name: args.name, scopes: args.scopes },
    });
    return { id, rawKey };
  },
});

/**
 * SECURITY: `verify` is the legitimate exception to CLAUDE.md §6's
 * "every function requires an identity" rule — the purpose of verification
 * is to establish identity from a key the caller already possesses. We look
 * up by hash, never by raw key, and return null (not the row) when the key
 * is unknown or expired. Callers (the MCP Worker) MUST treat the returned
 * `userId` as the trust boundary.
 */
export const verify = mutation({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("api_keys")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    if (row === null) {
      return null;
    }
    if (row.expiresAt !== undefined && row.expiresAt < Date.now()) {
      return null;
    }
    await ctx.db.patch(row._id, { lastUsedAt: Date.now() });
    return { ...row, lastUsedAt: Date.now() };
  },
});

export const revoke = mutation({
  args: { id: v.id("api_keys") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null || row.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Key not found" });
    }
    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      userId,
      action: "apiKey.revoke",
      actor: userId,
      diff: { id: args.id },
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("api_keys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});
