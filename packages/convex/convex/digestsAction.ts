import { createOpenRouterDigestSummarizer } from "@openbrains/ingest/summarize";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { action, internalAction } from "./_generated/server.js";

const DAY_MS = 24 * 60 * 60 * 1000;

interface CollectResult {
  thoughts: ReadonlyArray<{
    _id: string;
    content: string;
    metadata: {
      type?: string;
      topics: readonly string[];
      people: readonly string[];
      action_items: readonly string[];
      dates_mentioned: readonly string[];
    };
    createdAt: number;
  }>;
}

/**
 * Daily digest generator. Called by the cron once per day per user. Idempotent
 * — re-running for the same window just updates the existing digest row.
 *
 * Decisions:
 * - Summarizer is built per-invocation from OPENROUTER_API_KEY. No global
 *   instance because Convex actions are stateless.
 * - Failures (missing API key, network) record a job_run with status=failure
 *   but do NOT throw — the cron is best-effort.
 */
export type DigestRunOutcome =
  | { status: "skipped" }
  | { status: "failure" }
  | { status: "success"; thoughtCount: number };

export const generateForUserInternal = internalAction({
  args: {
    userId: v.string(),
    windowEndMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DigestRunOutcome> => {
    const startedAt = Date.now();
    const windowEndMs = args.windowEndMs ?? startedAt;
    const windowStartMs = windowEndMs - DAY_MS;

    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (apiKey === undefined || apiKey === "") {
      await ctx.runMutation(internal.jobs.recordRunInternal, {
        name: "digests.daily",
        userId: args.userId,
        status: "skipped",
        startedAt,
        finishedAt: Date.now(),
        note: "OPENROUTER_API_KEY not set",
      });
      return { status: "skipped" as const };
    }

    let collected: CollectResult;
    try {
      collected = (await ctx.runQuery(internal.digests.collectWindowInternal, {
        userId: args.userId,
        windowStartMs,
        windowEndMs,
      })) as CollectResult;
    } catch (e) {
      await ctx.runMutation(internal.jobs.recordRunInternal, {
        name: "digests.daily",
        userId: args.userId,
        status: "failure",
        startedAt,
        finishedAt: Date.now(),
        note: e instanceof Error ? e.message : "collect failed",
      });
      return { status: "failure" as const };
    }

    const summarizer = createOpenRouterDigestSummarizer({ apiKey });
    const summary = await summarizer.summarize(
      collected.thoughts.map((t) => {
        const src: {
          id: string;
          content: string;
          topics: readonly string[];
          createdAt: number;
          type?: string;
        } = {
          id: t._id,
          content: t.content,
          topics: t.metadata.topics,
          createdAt: t.createdAt,
        };
        if (t.metadata.type !== undefined) {
          src.type = t.metadata.type;
        }
        return src;
      }),
    );

    // The summarizer returns thoughtIds as strings; cast back to Convex Ids
    // here. Safe: the query that produced them is also tenant-scoped.
    await ctx.runMutation(internal.digests.recordInternal, {
      summary: {
        userId: args.userId,
        date: digestDateLabelFromMs(windowEndMs),
        summary: summary.summary,
        thoughtIds: summary.thoughtIds as unknown as never[],
        thoughtCount: collected.thoughts.length,
        generator: summary.generator,
      },
    });

    await ctx.runMutation(internal.jobs.recordRunInternal, {
      name: "digests.daily",
      userId: args.userId,
      status: "success",
      startedAt,
      finishedAt: Date.now(),
      note: `${collected.thoughts.length} thought(s)`,
    });

    return { status: "success" as const, thoughtCount: collected.thoughts.length };
  },
});

// Duplicated here so the action module doesn't import from digests.ts (which
// would create a one-way circular pair on the api type). Kept tested via
// digests.test.ts where the canonical implementation also runs.
function digestDateLabelFromMs(endMs: number): string {
  const d = new Date(endMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Public "regenerate now" action — called by the Digests dashboard page. The
 * caller is the authenticated user; we forward to the internal generator with
 * their Clerk userId.
 */
export const regenerateForMe = action({
  args: {},
  handler: async (ctx): Promise<DigestRunOutcome> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("UNAUTHENTICATED");
    }
    return (await ctx.runAction(internal.digestsAction.generateForUserInternal, {
      userId: identity.subject,
    })) as DigestRunOutcome;
  },
});
