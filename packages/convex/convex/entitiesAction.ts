import { createWorkersAiHttpChatClient } from "@openbrains/ingest/chat";
import { createWorkersAiEntityExtractor } from "@openbrains/ingest/entities";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { internalAction } from "./_generated/server.js";
import { readChatBridgeEnv } from "./_lib/chatEnv.js";

export type ExtractionOutcome =
  | { status: "skipped"; reason: string }
  | { status: "success"; entitiesUpserted: number; relationsUpserted: number };

export const extractFromThoughtInternal = internalAction({
  args: { userId: v.string(), thoughtId: v.id("thoughts"), content: v.string() },
  handler: async (ctx, args): Promise<ExtractionOutcome> => {
    const env = readChatBridgeEnv();
    if ("skipped" in env) {
      return { status: "skipped", reason: env.skipped };
    }
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

    return {
      status: "success",
      entitiesUpserted: result.entities.length,
      relationsUpserted,
    };
  },
});
