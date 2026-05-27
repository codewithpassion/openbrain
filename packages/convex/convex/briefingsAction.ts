/**
 * Phase G: the life-engine briefing action. Mirrors the `digestsAction`
 * pattern — best-effort, env-gated, never throws on the unhappy path.
 *
 * Inputs:
 *   - Recent (24h) thoughts via `digests.collectWindowInternal`
 *   - The user's instruction-grade world-model thought via
 *     `briefings.worldModelForInternal` (may be null — briefings still run)
 *   - The LLM summary via `createWorkersAiDigestSummarizer`
 *
 * Output:
 *   - One `briefings` row per (userId, date) — idempotent
 *   - One paired `thoughts` row with `metadata.type === "briefing"`, written
 *     by `briefings.recordInternal` after the briefing lands.
 */
import { createWorkersAiHttpChatClient } from "@openbrains/ingest/chat";
import { createWorkersAiDigestSummarizer } from "@openbrains/ingest/summarize";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { action, internalAction } from "./_generated/server.js";
import { readChatBridgeEnv } from "./_lib/chatEnv.js";

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

interface WorldModel {
  _id: string;
  content: string;
}

export type BriefingRunOutcome =
  | { status: "skipped"; reason: string }
  | { status: "failure"; reason: string }
  | { status: "success"; thoughtCount: number; hadWorldModel: boolean };

export const generateForUserInternal = internalAction({
  args: {
    userId: v.string(),
    windowEndMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BriefingRunOutcome> => {
    const startedAt = Date.now();
    const windowEndMs = args.windowEndMs ?? startedAt;
    const windowStartMs = windowEndMs - DAY_MS;

    const chatEnv = readChatBridgeEnv();
    if ("skipped" in chatEnv) {
      await ctx.runMutation(internal.jobs.recordRunInternal, {
        name: "briefings.daily",
        userId: args.userId,
        status: "skipped",
        startedAt,
        finishedAt: Date.now(),
        note: chatEnv.skipped,
      });
      return { status: "skipped", reason: chatEnv.skipped };
    }

    let collected: CollectResult;
    try {
      collected = (await ctx.runQuery(internal.digests.collectWindowInternal, {
        userId: args.userId,
        windowStartMs,
        windowEndMs,
      })) as CollectResult;
    } catch (e) {
      const note = e instanceof Error ? e.message : "collect failed";
      await ctx.runMutation(internal.jobs.recordRunInternal, {
        name: "briefings.daily",
        userId: args.userId,
        status: "failure",
        startedAt,
        finishedAt: Date.now(),
        note,
      });
      return { status: "failure", reason: note };
    }

    const worldModel = (await ctx.runMutation(internal.briefings.worldModelForInternal, {
      userId: args.userId,
    })) as WorldModel | null;

    const ai = createWorkersAiHttpChatClient({
      baseUrl: chatEnv.baseUrl,
      internalSecret: chatEnv.secret,
    });
    const summarizer = createWorkersAiDigestSummarizer({ ai });
    const summary = await summarizer.summarize(summarizeInputs(collected.thoughts, worldModel));

    const sections = deriveSections(collected.thoughts);

    await ctx.runMutation(internal.briefings.recordInternal, {
      userId: args.userId,
      date: briefingDateLabel(windowEndMs),
      summary: summary.summary,
      sections,
      thoughtIds: summary.thoughtIds as unknown as never[],
      generator: summary.generator,
    });

    await ctx.runMutation(internal.jobs.recordRunInternal, {
      name: "briefings.daily",
      userId: args.userId,
      status: "success",
      startedAt,
      finishedAt: Date.now(),
      note: `${collected.thoughts.length.toString()} thought(s)${
        worldModel === null ? "" : ", with world-model"
      }`,
    });

    return {
      status: "success",
      thoughtCount: collected.thoughts.length,
      hadWorldModel: worldModel !== null,
    };
  },
});

function summarizeInputs(
  thoughts: CollectResult["thoughts"],
  worldModel: WorldModel | null,
): ReadonlyArray<{
  id: string;
  content: string;
  topics: readonly string[];
  createdAt: number;
  type?: string;
}> {
  const inputs: {
    id: string;
    content: string;
    topics: readonly string[];
    createdAt: number;
    type?: string;
  }[] = thoughts.map((t) => {
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
  });
  if (worldModel !== null) {
    // Prepend the world model so the summarizer treats it as the anchoring
    // context. It's first in the chronology even though it isn't "today" —
    // its `createdAt` is set to 0 so the LLM treats it as standing input.
    inputs.unshift({
      id: worldModel._id,
      content: `WORLD_MODEL: ${worldModel.content}`,
      topics: ["world-model"],
      createdAt: 0,
      type: "world_model",
    });
  }
  return inputs;
}

function deriveSections(thoughts: CollectResult["thoughts"]): {
  recent: string[];
  followUps: string[];
  openQuestions: string[];
} {
  const recent = thoughts
    .slice(0, 8)
    .map((t) => `${(t.metadata.type ?? "thought").toUpperCase()}: ${truncate(t.content, 140)}`);
  const followUps = uniq(thoughts.flatMap((t) => t.metadata.action_items));
  const openQuestions = uniq(
    thoughts.filter((t) => t.content.trim().endsWith("?")).map((t) => truncate(t.content, 200)),
  );
  return { recent, followUps, openQuestions };
}

function uniq(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v === "" || seen.has(v)) {
      continue;
    }
    seen.add(v);
    out.push(v);
  }
  return out;
}

function truncate(input: string, n: number): string {
  if (input.length <= n) {
    return input;
  }
  return `${input.slice(0, n)}…`;
}

function briefingDateLabel(endMs: number): string {
  const d = new Date(endMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Public "regenerate now" action — called from the `/briefings` page.
 */
export const regenerateForMe = action({
  args: {},
  handler: async (ctx): Promise<BriefingRunOutcome> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("UNAUTHENTICATED");
    }
    return (await ctx.runAction(internal.briefingsAction.generateForUserInternal, {
      userId: identity.subject,
    })) as BriefingRunOutcome;
  },
});
