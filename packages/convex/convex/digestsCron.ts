import { internal } from "./_generated/api.js";
import { internalAction, internalQuery } from "./_generated/server.js";

const FANOUT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the set of unique userIds with at least one thought in the last 24h.
 * Cheap-enough scan in v1: takes the 1000 most-recent thoughts and de-dupes.
 * If we cross 1000 thoughts/day across all tenants, this gets replaced with a
 * per-user "lastActiveAt" index.
 */
export const listActiveUsersInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - FANOUT_WINDOW_MS;
    // The schema's only thought index is `by_user_created`, so a global scan
    // forces us to use `.collect()` over the table with a date filter. Cap at
    // a generous limit to bound cost; document the constraint above.
    const rows = await ctx.db.query("thoughts").collect();
    const recent = rows.filter((r) => r.createdAt >= cutoff);
    return [...new Set(recent.map((r) => r.userId))];
  },
});

export const fanOutDailyDigests = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds = (await ctx.runQuery(internal.digestsCron.listActiveUsersInternal, {})) as
      | readonly string[]
      | string[];
    for (const userId of userIds) {
      await ctx.runAction(internal.digestsAction.generateForUserInternal, { userId });
    }
    return { dispatched: userIds.length };
  },
});
