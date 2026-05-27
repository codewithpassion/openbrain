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

/**
 * Daily life-engine briefing fan-out. Scheduled 30 min after digests so the
 * two crons don't pile onto the same window of token spend; the briefing
 * action is independent and re-uses the same active-user list.
 */
crons.daily(
  "briefings.daily fan-out",
  { hourUTC: 12, minuteUTC: 30 },
  internal.briefingsCron.fanOutDailyBriefings,
);

export default crons;
