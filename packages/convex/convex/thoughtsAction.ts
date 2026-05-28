/**
 * Phase E scheduled-actions: persistence counterparts of the read-only Phase E
 * MCP tools (`classify_thought`, `enrich_thought`, `pan_brain_dump`).
 *
 * Adaptive capture: when a thought lands without `metadata.type`, the
 * `createThought` mutation schedules `classifyOnCaptureInternal` via
 * `ctx.scheduler.runAfter(0, ...)`. The action calls Workers AI (via the
 * dashboard worker's `/internal/ai/chat` bridge) and patches the type back via
 * `thoughts.setTypeInternal`. If `DASHBOARD_WORKER_URL` /
 * `INTERNAL_API_SECRET` are unset we record a `skipped` outcome — never throw
 * — so the cron-style hooks stay best-effort.
 *
 * Enrichment & panning follow the same shape: action talks to the LLM, an
 * internal mutation does the boundary-safe persistence.
 */

import {
  createWorkersAiBrainDumpSplitter,
  createWorkersAiEmbedder,
  createWorkersAiHttpClient,
} from "@openbrains/ingest";
import { createWorkersAiHttpChatClient } from "@openbrains/ingest/chat";
import { createWorkersAiMetadataExtractor } from "@openbrains/ingest/metadata";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { type ActionCtx, internalAction } from "./_generated/server.js";
import { readChatBridgeEnv } from "./_lib/chatEnv.js";

async function recordRun(
  ctx: ActionCtx,
  args: {
    name: string;
    userId: string;
    status: "success" | "failure" | "skipped";
    startedAt: number;
    note?: string;
  },
): Promise<void> {
  await ctx.runMutation(internal.jobs.recordRunInternal, {
    name: args.name,
    userId: args.userId,
    status: args.status,
    startedAt: args.startedAt,
    finishedAt: Date.now(),
    ...(args.note === undefined ? {} : { note: args.note }),
  });
}

const DEFAULT_EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";

type WorkerEnv = { baseUrl: string; secret: string };

function readWorkerEnv(): WorkerEnv | { skipped: string } {
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  const baseUrl = process.env["MCP_WORKER_URL"];
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  const secret = process.env["INTERNAL_API_SECRET"];
  if (baseUrl === undefined || baseUrl === "") {
    return { skipped: "MCP_WORKER_URL not set" };
  }
  if (secret === undefined || secret === "") {
    return { skipped: "INTERNAL_API_SECRET not set" };
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret };
}

export type ClassifyOutcome =
  | { status: "skipped"; reason: string }
  | { status: "noop"; reason: string }
  | { status: "failure"; reason: string }
  | { status: "success"; type: string };

export type EnrichOutcome =
  | { status: "skipped"; reason: string }
  | { status: "failure"; reason: string }
  | { status: "success" };

export type SplitOutcome =
  | { status: "skipped"; reason: string }
  | { status: "failure"; reason: string }
  | { status: "success"; created: number };

export type ReembedOutcome =
  | { status: "skipped"; reason: string }
  | { status: "failure"; reason: string }
  | { status: "success"; model: string; dimensions: number };

export type DeleteVectorOutcome =
  | { status: "skipped"; reason: string }
  | { status: "failure"; reason: string }
  | { status: "success" };

export const classifyOnCaptureInternal = internalAction({
  args: { userId: v.string(), thoughtId: v.id("thoughts") },
  handler: async (ctx, args): Promise<ClassifyOutcome> => {
    const startedAt = Date.now();
    const name = "thoughts.classify";
    const chatEnv = readChatBridgeEnv();
    if ("skipped" in chatEnv) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "skipped",
        startedAt,
        note: chatEnv.skipped,
      });
      return { status: "skipped", reason: chatEnv.skipped };
    }
    const thought = await ctx.runQuery(internal.thoughts.getThoughtInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
    });
    if (thought === null) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: "thought not found",
      });
      return { status: "failure", reason: "thought not found" };
    }
    if (thought.metadata.type !== undefined && thought.metadata.type !== "") {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "success",
        startedAt,
        note: "noop: type already set",
      });
      return { status: "noop", reason: "type already set" };
    }
    const ai = createWorkersAiHttpChatClient({
      baseUrl: chatEnv.baseUrl,
      internalSecret: chatEnv.secret,
    });
    const extractor = createWorkersAiMetadataExtractor({ ai });
    const metadata = await extractor.extract(thought.content);
    if (metadata.type === undefined) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "success",
        startedAt,
        note: "noop: extractor returned no type",
      });
      return { status: "noop", reason: "extractor returned no type" };
    }
    const wrote = await ctx.runMutation(internal.thoughts.setTypeInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
      type: metadata.type,
    });
    if (!wrote) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "success",
        startedAt,
        note: "noop: type was set concurrently",
      });
      return { status: "noop", reason: "type was set concurrently" };
    }
    await recordRun(ctx, {
      name,
      userId: args.userId,
      status: "success",
      startedAt,
      note: `type=${metadata.type}`,
    });
    return { status: "success", type: metadata.type };
  },
});

export const enrichThoughtInternal = internalAction({
  args: { userId: v.string(), thoughtId: v.id("thoughts") },
  handler: async (ctx, args): Promise<EnrichOutcome> => {
    const startedAt = Date.now();
    const name = "thoughts.enrich";
    const chatEnv = readChatBridgeEnv();
    if ("skipped" in chatEnv) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "skipped",
        startedAt,
        note: chatEnv.skipped,
      });
      return { status: "skipped", reason: chatEnv.skipped };
    }
    const thought = await ctx.runQuery(internal.thoughts.getThoughtInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
    });
    if (thought === null) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: "thought not found",
      });
      return { status: "failure", reason: "thought not found" };
    }
    const ai = createWorkersAiHttpChatClient({
      baseUrl: chatEnv.baseUrl,
      internalSecret: chatEnv.secret,
    });
    const extractor = createWorkersAiMetadataExtractor({ ai });
    const metadata = await extractor.extract(thought.content);
    await ctx.runMutation(internal.thoughts.mergeMetadataInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
      metadata: {
        ...(metadata.type === undefined ? {} : { type: metadata.type }),
        topics: [...metadata.topics],
        people: [...metadata.people],
        action_items: [...metadata.action_items],
        dates_mentioned: [...metadata.dates_mentioned],
      },
    });
    await recordRun(ctx, {
      name,
      userId: args.userId,
      status: "success",
      startedAt,
      note: `${metadata.topics.length.toString()} topic(s), ${metadata.people.length.toString()} person/people`,
    });
    return { status: "success" };
  },
});

/**
 * Recompute the embedding for a thought and upsert it into Vectorize.
 *
 * Scheduled by `updateContent` (auto re-index after a dashboard edit) and by
 * the public `reembedThought` mutation (manual "Reindex" button). Best-effort:
 * when MCP_WORKER_URL / INTERNAL_API_SECRET are unset (local dev without the
 * Worker), returns `skipped`; never throws.
 *
 * The Vectorize ID convention is `row.vectorizeId ?? thoughtId` — `captureThought`
 * does not write `vectorizeId` back to Convex, so most rows leave it undefined
 * and we fall through to the thoughtId. We patch `vectorizeId` here so the row
 * becomes self-describing after the first reembed.
 */
export const reembedInternal = internalAction({
  args: { userId: v.string(), thoughtId: v.id("thoughts") },
  handler: async (ctx, args): Promise<ReembedOutcome> => {
    const startedAt = Date.now();
    const name = "thoughts.reembed";
    const env = readWorkerEnv();
    if ("skipped" in env) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "skipped",
        startedAt,
        note: env.skipped,
      });
      return { status: "skipped", reason: env.skipped };
    }
    const thought = await ctx.runQuery(internal.thoughts.getThoughtInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
    });
    if (thought === null) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: "thought not found",
      });
      return { status: "failure", reason: "thought not found" };
    }
    const ai = createWorkersAiHttpClient({ baseUrl: env.baseUrl, internalSecret: env.secret });
    const embedder = createWorkersAiEmbedder(ai, { model: DEFAULT_EMBEDDING_MODEL });
    let embedding: { vector: readonly number[]; dimensions: number; model: string };
    try {
      embedding = await embedder.embed(thought.content);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "embed failed";
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: reason,
      });
      return { status: "failure", reason };
    }
    const vectorizeId = thought.vectorizeId ?? args.thoughtId;
    const upsertMetadata: { source: string; type?: string } =
      thought.metadata.type !== undefined && thought.metadata.type !== ""
        ? { source: thought.source, type: thought.metadata.type }
        : { source: thought.source };
    let res: Response;
    try {
      res = await fetch(`${env.baseUrl}/internal/vector/upsert`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openbrains-internal-secret": env.secret,
        },
        body: JSON.stringify({
          userId: args.userId,
          id: vectorizeId,
          values: embedding.vector,
          metadata: upsertMetadata,
        }),
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "upsert fetch failed";
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: reason,
      });
      return { status: "failure", reason };
    }
    if (!res.ok) {
      const reason = `vector upsert ${res.status.toString()}`;
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: reason,
      });
      return { status: "failure", reason };
    }
    await ctx.runMutation(internal.thoughts.setEmbeddingInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
      embeddingModel: embedding.model,
      embeddingDims: embedding.dimensions,
      vectorizeId,
    });
    await recordRun(ctx, {
      name,
      userId: args.userId,
      status: "success",
      startedAt,
      note: `${embedding.model} (${embedding.dimensions.toString()}d)`,
    });
    return { status: "success", model: embedding.model, dimensions: embedding.dimensions };
  },
});

/**
 * Delete a vector from Vectorize. Scheduled by `deleteThought` after the
 * Convex row is removed; the row's `vectorizeId ?? thoughtId` is captured
 * beforehand and passed in here (Convex actions can't read deleted rows).
 *
 * Best-effort like `reembedInternal`. The `thought.delete` audit row written
 * by the mutation captures intent; this action's return outcome is the
 * cleanup diagnostic surface.
 */
export const deleteVectorInternal = internalAction({
  args: { userId: v.string(), vectorizeId: v.string() },
  handler: async (ctx, args): Promise<DeleteVectorOutcome> => {
    const startedAt = Date.now();
    const name = "thoughts.deleteVector";
    const env = readWorkerEnv();
    if ("skipped" in env) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "skipped",
        startedAt,
        note: env.skipped,
      });
      return { status: "skipped", reason: env.skipped };
    }
    let res: Response;
    try {
      res = await fetch(`${env.baseUrl}/internal/vector/delete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openbrains-internal-secret": env.secret,
        },
        body: JSON.stringify({ userId: args.userId, id: args.vectorizeId }),
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "delete fetch failed";
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: reason,
      });
      return { status: "failure", reason };
    }
    if (!res.ok) {
      const reason = `vector delete ${res.status.toString()}`;
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: reason,
      });
      return { status: "failure", reason };
    }
    await recordRun(ctx, {
      name,
      userId: args.userId,
      status: "success",
      startedAt,
      note: `vector ${args.vectorizeId} deleted`,
    });
    return { status: "success" };
  },
});

export const splitBrainDumpInternal = internalAction({
  args: {
    userId: v.string(),
    parentThoughtId: v.id("thoughts"),
    maxIdeas: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SplitOutcome> => {
    const startedAt = Date.now();
    const name = "thoughts.split";
    const chatEnv = readChatBridgeEnv();
    if ("skipped" in chatEnv) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "skipped",
        startedAt,
        note: chatEnv.skipped,
      });
      return { status: "skipped", reason: chatEnv.skipped };
    }
    const parent = await ctx.runQuery(internal.thoughts.getThoughtInternal, {
      userId: args.userId,
      thoughtId: args.parentThoughtId,
    });
    if (parent === null) {
      await recordRun(ctx, {
        name,
        userId: args.userId,
        status: "failure",
        startedAt,
        note: "parent thought not found",
      });
      return { status: "failure", reason: "parent thought not found" };
    }
    const ai = createWorkersAiHttpChatClient({
      baseUrl: chatEnv.baseUrl,
      internalSecret: chatEnv.secret,
    });
    const splitter = createWorkersAiBrainDumpSplitter({ ai });
    const ideas = await splitter.split(parent.content, args.maxIdeas ?? 5);
    const result = await ctx.runMutation(internal.thoughts.persistSplitInternal, {
      userId: args.userId,
      parentThoughtId: args.parentThoughtId,
      ideas: ideas.map((i) => {
        const out: { content: string; topics: string[]; type?: string } = {
          content: i.content,
          topics: [...i.topics],
        };
        if (i.type !== undefined) {
          out.type = i.type;
        }
        return out;
      }),
    });
    await recordRun(ctx, {
      name,
      userId: args.userId,
      status: "success",
      startedAt,
      note: `${result.created.toString()} idea(s) created`,
    });
    return { status: "success", created: result.created };
  },
});
