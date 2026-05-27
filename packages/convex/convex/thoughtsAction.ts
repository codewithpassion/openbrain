/**
 * Phase E scheduled-actions: persistence counterparts of the read-only Phase E
 * MCP tools (`classify_thought`, `enrich_thought`, `pan_brain_dump`).
 *
 * Adaptive capture: when a thought lands without `metadata.type`, the
 * `createThought` mutation schedules `classifyOnCaptureInternal` via
 * `ctx.scheduler.runAfter(0, ...)`. The action calls the LLM and patches the
 * type back via `thoughts.setTypeInternal`. If `OPENROUTER_API_KEY` is unset
 * we record a `skipped` outcome — never throw — so the cron-style hooks stay
 * best-effort.
 *
 * Enrichment & panning follow the same shape: action talks to the LLM, an
 * internal mutation does the boundary-safe persistence.
 */
import {
  createOpenRouterBrainDumpSplitter,
  createOpenRouterMetadataExtractor,
  createWorkersAiEmbedder,
  createWorkersAiHttpClient,
} from "@openbrains/ingest";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalAction } from "./_generated/server.js";

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

function readApiKey(): string | undefined {
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  const key = process.env["OPENROUTER_API_KEY"];
  if (key === undefined || key === "") {
    return undefined;
  }
  return key;
}

export const classifyOnCaptureInternal = internalAction({
  args: { userId: v.string(), thoughtId: v.id("thoughts") },
  handler: async (ctx, args): Promise<ClassifyOutcome> => {
    const apiKey = readApiKey();
    if (apiKey === undefined) {
      return { status: "skipped", reason: "OPENROUTER_API_KEY not set" };
    }
    const thought = await ctx.runQuery(internal.thoughts.getThoughtInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
    });
    if (thought === null) {
      return { status: "failure", reason: "thought not found" };
    }
    if (thought.metadata.type !== undefined && thought.metadata.type !== "") {
      return { status: "noop", reason: "type already set" };
    }
    const extractor = createOpenRouterMetadataExtractor({ apiKey });
    const metadata = await extractor.extract(thought.content);
    if (metadata.type === undefined) {
      return { status: "noop", reason: "extractor returned no type" };
    }
    const wrote = await ctx.runMutation(internal.thoughts.setTypeInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
      type: metadata.type,
    });
    if (!wrote) {
      return { status: "noop", reason: "type was set concurrently" };
    }
    return { status: "success", type: metadata.type };
  },
});

export const enrichThoughtInternal = internalAction({
  args: { userId: v.string(), thoughtId: v.id("thoughts") },
  handler: async (ctx, args): Promise<EnrichOutcome> => {
    const apiKey = readApiKey();
    if (apiKey === undefined) {
      return { status: "skipped", reason: "OPENROUTER_API_KEY not set" };
    }
    const thought = await ctx.runQuery(internal.thoughts.getThoughtInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
    });
    if (thought === null) {
      return { status: "failure", reason: "thought not found" };
    }
    const extractor = createOpenRouterMetadataExtractor({ apiKey });
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
    const env = readWorkerEnv();
    if ("skipped" in env) {
      return { status: "skipped", reason: env.skipped };
    }
    const thought = await ctx.runQuery(internal.thoughts.getThoughtInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
    });
    if (thought === null) {
      return { status: "failure", reason: "thought not found" };
    }
    const ai = createWorkersAiHttpClient({ baseUrl: env.baseUrl, internalSecret: env.secret });
    const embedder = createWorkersAiEmbedder(ai, { model: DEFAULT_EMBEDDING_MODEL });
    let embedding: { vector: readonly number[]; dimensions: number; model: string };
    try {
      embedding = await embedder.embed(thought.content);
    } catch (e) {
      return { status: "failure", reason: e instanceof Error ? e.message : "embed failed" };
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
      return { status: "failure", reason: e instanceof Error ? e.message : "upsert fetch failed" };
    }
    if (!res.ok) {
      return { status: "failure", reason: `vector upsert ${res.status.toString()}` };
    }
    await ctx.runMutation(internal.thoughts.setEmbeddingInternal, {
      userId: args.userId,
      thoughtId: args.thoughtId,
      embeddingModel: embedding.model,
      embeddingDims: embedding.dimensions,
      vectorizeId,
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
  handler: async (_ctx, args): Promise<DeleteVectorOutcome> => {
    const env = readWorkerEnv();
    if ("skipped" in env) {
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
      return { status: "failure", reason: e instanceof Error ? e.message : "delete fetch failed" };
    }
    if (!res.ok) {
      return { status: "failure", reason: `vector delete ${res.status.toString()}` };
    }
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
    const apiKey = readApiKey();
    if (apiKey === undefined) {
      return { status: "skipped", reason: "OPENROUTER_API_KEY not set" };
    }
    const parent = await ctx.runQuery(internal.thoughts.getThoughtInternal, {
      userId: args.userId,
      thoughtId: args.parentThoughtId,
    });
    if (parent === null) {
      return { status: "failure", reason: "parent thought not found" };
    }
    const splitter = createOpenRouterBrainDumpSplitter({ apiKey });
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
    return { status: "success", created: result.created };
  },
});
