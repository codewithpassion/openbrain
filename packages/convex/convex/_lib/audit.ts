import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel.js";

export interface AuditEntry {
  thoughtId?: Id<"thoughts">;
  userId: string;
  action: string;
  actor: string;
  diff: unknown;
}

/**
 * Append an immutable row to memory_audit. Every mutation that affects a
 * memory sidecar or thought writes here.
 */
export async function writeAudit(
  ctx: GenericMutationCtx<DataModel>,
  entry: AuditEntry,
): Promise<void> {
  const row: {
    userId: string;
    action: string;
    actor: string;
    at: number;
    diff: unknown;
    thoughtId?: Id<"thoughts">;
  } = {
    userId: entry.userId,
    action: entry.action,
    actor: entry.actor,
    at: Date.now(),
    diff: entry.diff,
  };
  if (entry.thoughtId !== undefined) {
    row.thoughtId = entry.thoughtId;
  }
  await ctx.db.insert("memory_audit", row);
}
