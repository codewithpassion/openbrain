import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

/**
 * Daily digest fan-out. The actual per-user generation is parameterized, so
 * the cron just enumerates users with at least one thought in the last 24h
 * and schedules the generator action for each.
 *
 * Note: we deliberately don't list users by Clerk — we list by `thoughts`
 * authorship so we never spend tokens summarizing an empty brain.
 */
crons.daily(
  "digests.daily fan-out",
  { hourUTC: 12, minuteUTC: 0 },
  internal.digestsCron.fanOutDailyDigests,
);

export default crons;
