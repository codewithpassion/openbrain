import { createWorkersAiHttpChatClient } from "@openbrains/ingest/chat";
import { createWorkersAiEntityExtractor } from "@openbrains/ingest/entities";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { type ActionCtx, internalAction } from "./_generated/server.js";
import { readChatBridgeEnv } from "./_lib/chatEnv.js";

export type ExtractionOutcome =
  | { status: "skipped"; reason: string }
  | { status: "success"; entitiesUpserted: number; relationsUpserted: number };

const JOB_NAME = "entities.extract";

async function recordRun(
  ctx: ActionCtx,
  args: {
    userId: string;
    status: "success" | "failure" | "skipped";
    startedAt: number;
    note?: string;
  },
): Promise<void> {
  await ctx.runMutation(internal.jobs.recordRunInternal, {
    name: JOB_NAME,
    userId: args.userId,
    status: args.status,
    startedAt: args.startedAt,
    finishedAt: Date.now(),
    ...(args.note === undefined ? {} : { note: args.note }),
  });
}

export const extractFromThoughtInternal = internalAction({
  args: { userId: v.string(), thoughtId: v.id("thoughts"), content: v.string() },
  handler: async (ctx, args): Promise<ExtractionOutcome> => {
    const startedAt = Date.now();
    const env = readChatBridgeEnv();
    if ("skipped" in env) {
      await recordRun(ctx, {
        userId: args.userId,
        status: "skipped",
        startedAt,
        note: env.skipped,
      });
      return { status: "skipped", reason: env.skipped };
    }
    // Wipe any prior mentions / relation evidence for this thought before
    // upserting from the new content, so editing a thought doesn't leave
    // stale entries behind. Relations whose evidence becomes empty are
    // deleted outright (see `entities.clearForThoughtInternal`).
    await ctx.runMutation(internal.entities.clearForThoughtInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
    });
    const ai = createWorkersAiHttpChatClient({
      baseUrl: env.baseUrl,
      internalSecret: env.secret,
    });
    const extractor = createWorkersAiEntityExtractor({ ai });
    const result = await extractor.extract(args.content);

    const nameToId = new Map<string, Id<"entities">>();
    for (const entity of result.entities) {
      const id = await ctx.runMutation(internal.entities.upsertInternal, {
        userId: args.userId,
        entity: {
          canonicalName: entity.canonicalName,
          kind: entity.kind,
          aliases: entity.aliases === undefined ? [] : [...entity.aliases],
        },
      });
      nameToId.set(entity.canonicalName, id);
      await ctx.runMutation(internal.entities.mentionInternal, {
        userId: args.userId,
        entityId: id,
        thoughtId: args.thoughtId,
      });
    }

    let relationsUpserted = 0;
    for (const rel of result.relations) {
      const fromId = nameToId.get(rel.fromCanonicalName);
      const toId = nameToId.get(rel.toCanonicalName);
      if (fromId === undefined || toId === undefined) {
        continue;
      }
      await ctx.runMutation(internal.entities.relateInternal, {
        userId: args.userId,
        relation: {
          fromEntityId: fromId,
          toEntityId: toId,
          kind: rel.kind,
          evidenceThoughtIds: [args.thoughtId],
          confidence: rel.confidence ?? 0.5,
        },
      });
      relationsUpserted += 1;
    }

    await recordRun(ctx, {
      userId: args.userId,
      status: "success",
      startedAt,
      note: `${result.entities.length.toString()} entit${result.entities.length === 1 ? "y" : "ies"}, ${relationsUpserted.toString()} relation${relationsUpserted === 1 ? "" : "s"}`,
    });
    return {
      status: "success",
      entitiesUpserted: result.entities.length,
      relationsUpserted,
    };
  },
});
