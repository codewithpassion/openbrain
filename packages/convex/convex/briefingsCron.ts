import { internal } from "./_generated/api.js";
import { internalAction } from "./_generated/server.js";

/**
 * Phase G: daily life-engine briefing fan-out. Re-uses
 * `digestsCron.listActiveUsersInternal` because the active-user definition
 * is identical: at least one thought captured in the last 24h.
 */
export const fanOutDailyBriefings = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds = (await ctx.runQuery(internal.digestsCron.listActiveUsersInternal, {})) as
      | readonly string[]
      | string[];
    for (const userId of userIds) {
      await ctx.runAction(internal.briefingsAction.generateForUserInternal, { userId });
    }
    return { dispatched: userIds.length };
  },
});
