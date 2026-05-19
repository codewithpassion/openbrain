import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel.js";

export interface JobRunEntry {
  name: string;
  userId?: string;
  status: "success" | "failure" | "skipped";
  startedAt: number;
  finishedAt: number;
  note?: string;
}

/**
 * Append a row to job_runs. The Jobs dashboard reads from this; cron handlers
 * call it once per execution. Failures are still recorded — that's the point.
 */
export async function recordJobRun(
  ctx: GenericMutationCtx<DataModel>,
  entry: JobRunEntry,
): Promise<void> {
  const row: {
    name: string;
    status: JobRunEntry["status"];
    startedAt: number;
    finishedAt: number;
    userId?: string;
    note?: string;
  } = {
    name: entry.name,
    status: entry.status,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
  };
  if (entry.userId !== undefined) {
    row.userId = entry.userId;
  }
  if (entry.note !== undefined) {
    row.note = entry.note;
  }
  await ctx.db.insert("job_runs", row);
}
