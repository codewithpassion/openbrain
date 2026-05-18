import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpClientLike } from "@openbrains/cli/mcp-client";
import {
  captureThoughtInputSchema,
  captureThoughtOutputSchema,
  listThoughtsInputSchema,
  listThoughtsOutputSchema,
  memoryRecallInputSchema,
  memoryRecallOutputSchema,
  memoryWritebackInputSchema,
  memoryWritebackOutputSchema,
  searchThoughtsInputSchema,
  searchThoughtsOutputSchema,
  ThoughtId,
  thoughtStatsInputSchema,
  thoughtStatsOutputSchema,
} from "@openbrains/shared";
import type { z } from "zod";
import { tokenOverlapScore } from "./scorer";

/**
 * In-process MCP server backed by a deterministic in-memory store. Used
 * exclusively by `OB_SMOKE_MOCK=1` to validate the smoke script's flow
 * without touching real Cloudflare/Convex infrastructure.
 *
 * Surface mirrors the production MCP Worker's tool contracts (same Zod
 * schemas from `@openbrains/shared`), but skips embedding, Vectorize,
 * and Clerk. The advisor's note on memoryRecall output stands: this
 * server returns flattened recall results because that's what the
 * shared schema defines — provenance/usePolicy live at the Convex
 * boundary, not the MCP tool boundary.
 */

interface StoredThought {
  readonly id: string;
  readonly content: string;
  readonly source: string;
  readonly createdAt: number;
}

type SearchInput = z.infer<typeof searchThoughtsInputSchema>;
type RecallInput = z.infer<typeof memoryRecallInputSchema>;
type CaptureInput = z.infer<typeof captureThoughtInputSchema>;
type WritebackInput = z.infer<typeof memoryWritebackInputSchema>;
type ListInput = z.infer<typeof listThoughtsInputSchema>;
type StatsInput = z.infer<typeof thoughtStatsInputSchema>;

export interface MockMcpHandle {
  readonly client: McpClientLike;
  readonly close: () => Promise<void>;
}

function nowMs(): number {
  return Date.now();
}

function rankByQuery(
  store: readonly StoredThought[],
  query: string,
  threshold: number,
  limit: number,
): { id: string; score: number; thought: StoredThought }[] {
  return store
    .map((t) => ({ id: t.id, score: tokenOverlapScore(t.content, query), thought: t }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function buildServer(store: StoredThought[]): McpServer {
  const server = new McpServer({ name: "ob-mcp-mock", version: "0.0.0" });

  let nextId = 1;
  const mintId = (): string => {
    const id = `t_${nextId.toString().padStart(6, "0")}`;
    nextId += 1;
    return id;
  };

  server.registerTool(
    "capture_thought",
    {
      description: "Capture a thought (mock).",
      inputSchema: captureThoughtInputSchema.shape,
      outputSchema: captureThoughtOutputSchema.shape,
    },
    (input: CaptureInput) => {
      const duplicate = store.some((t) => t.content === input.content);
      if (duplicate) {
        const existing = store.find((t) => t.content === input.content);
        if (existing === undefined) {
          throw new Error("internal mock invariant: duplicate without existing row");
        }
        const out = { thoughtId: ThoughtId.parse(existing.id), duplicate: true };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(out) }],
          structuredContent: out,
        };
      }
      const id = mintId();
      store.push({ id, content: input.content, source: input.source, createdAt: nowMs() });
      const out = { thoughtId: ThoughtId.parse(id), duplicate: false };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out) }],
        structuredContent: out,
      };
    },
  );

  server.registerTool(
    "search_thoughts",
    {
      description: "Semantic search (mock token-overlap).",
      inputSchema: searchThoughtsInputSchema.shape,
      outputSchema: searchThoughtsOutputSchema.shape,
    },
    (input: SearchInput) => {
      const matches = rankByQuery(store, input.query, input.threshold, input.limit);
      const out = {
        results: matches.map((m) => ({
          id: ThoughtId.parse(m.thought.id),
          score: m.score,
          content: m.thought.content,
          source: m.thought.source,
          createdAt: m.thought.createdAt,
        })),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out) }],
        structuredContent: out,
      };
    },
  );

  server.registerTool(
    "list_thoughts",
    {
      description: "List recent thoughts (mock).",
      inputSchema: listThoughtsInputSchema.shape,
      outputSchema: listThoughtsOutputSchema.shape,
    },
    (_input: ListInput) => {
      const out = {
        thoughts: store
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((t) => ({
            id: ThoughtId.parse(t.id),
            content: t.content,
            source: t.source,
            createdAt: t.createdAt,
          })),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out) }],
        structuredContent: out,
      };
    },
  );

  server.registerTool(
    "thought_stats",
    {
      description: "Aggregate stats (mock).",
      inputSchema: thoughtStatsInputSchema.shape,
      outputSchema: thoughtStatsOutputSchema.shape,
    },
    (_input: StatsInput) => {
      const out = {
        total: store.length,
        byType: {} as Record<string, number>,
        topTopics: [] as { topic: string; count: number }[],
        topPeople: [] as { person: string; count: number }[],
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out) }],
        structuredContent: out,
      };
    },
  );

  server.registerTool(
    "memory_recall",
    {
      description: "Memory recall with provenance + trust grade (mock).",
      inputSchema: memoryRecallInputSchema.shape,
      outputSchema: memoryRecallOutputSchema.shape,
    },
    (input: RecallInput) => {
      const matches = rankByQuery(store, input.query, input.threshold, input.limit);
      const out = {
        results: matches.map((m) => ({
          id: ThoughtId.parse(m.thought.id),
          score: m.score,
          content: m.thought.content,
          trustGrade: "evidence" as const,
          origin: "human" as const,
          createdAt: m.thought.createdAt,
        })),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out) }],
        structuredContent: out,
      };
    },
  );

  server.registerTool(
    "memory_writeback",
    {
      description: "Agent-inferred writeback (mock).",
      inputSchema: memoryWritebackInputSchema.shape,
      outputSchema: memoryWritebackOutputSchema.shape,
    },
    (input: WritebackInput) => {
      const id = mintId();
      store.push({ id, content: input.content, source: input.source, createdAt: nowMs() });
      const out = { thoughtId: ThoughtId.parse(id), trustGrade: "evidence" as const };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out) }],
        structuredContent: out,
      };
    },
  );

  return server;
}

function parseStructured<T>(
  result: { structuredContent?: unknown; isError?: boolean },
  schema: { parse: (input: unknown) => T },
  toolName: string,
): T {
  if (result.isError === true) {
    throw new Error(`mock MCP tool ${toolName} returned an error result`);
  }
  if (result.structuredContent === undefined || result.structuredContent === null) {
    throw new Error(`mock MCP tool ${toolName} returned no structuredContent`);
  }
  return schema.parse(result.structuredContent);
}

export async function startMockMcp(): Promise<MockMcpHandle> {
  const store: StoredThought[] = [];
  const server = buildServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const sdkClient = new Client({ name: "ob-cli-smoke", version: "0.0.0" });

  await server.connect(serverTransport);
  await sdkClient.connect(clientTransport);

  async function call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ structuredContent?: unknown; isError?: boolean }> {
    const res = await sdkClient.callTool({ name, arguments: args });
    return {
      structuredContent: res.structuredContent,
      isError: res.isError === true,
    };
  }

  const client: McpClientLike = {
    async captureThought(input) {
      const res = await call("capture_thought", input);
      return parseStructured(res, captureThoughtOutputSchema, "capture_thought");
    },
    async searchThoughts(input) {
      const res = await call("search_thoughts", input);
      return parseStructured(res, searchThoughtsOutputSchema, "search_thoughts");
    },
    async listThoughts(input) {
      const res = await call("list_thoughts", input);
      return parseStructured(res, listThoughtsOutputSchema, "list_thoughts");
    },
    async thoughtStats() {
      const res = await call("thought_stats", {});
      return parseStructured(res, thoughtStatsOutputSchema, "thought_stats");
    },
    async memoryRecall(input) {
      const res = await call("memory_recall", input);
      return parseStructured(res, memoryRecallOutputSchema, "memory_recall");
    },
    async memoryWriteback(input) {
      const res = await call("memory_writeback", input);
      return parseStructured(res, memoryWritebackOutputSchema, "memory_writeback");
    },
    async close() {
      await sdkClient.close();
    },
  };

  const close = async (): Promise<void> => {
    await sdkClient.close();
    await server.close();
  };

  return { client, close };
}
