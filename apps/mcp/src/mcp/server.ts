import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import {
  captureThoughtInputSchema,
  captureThoughtOutputSchema,
  fetchInputSchema,
  fetchOutputSchema,
  listThoughtsInputSchema,
  listThoughtsOutputSchema,
  memoryRecallInputSchema,
  memoryRecallOutputSchema,
  memoryReviewInputSchema,
  memoryReviewOutputSchema,
  memoryWritebackInputSchema,
  memoryWritebackOutputSchema,
  searchInputSchema,
  searchOutputSchema,
  searchThoughtsInputSchema,
  searchThoughtsOutputSchema,
  thoughtStatsInputSchema,
  thoughtStatsOutputSchema,
} from "@openbrains/shared";
import type { AuthContext } from "../auth/types";
import { captureThoughtHandler } from "./tools/capture-thought";
import { fetchThoughtHandler } from "./tools/fetch-thought";
import { listThoughtsHandler } from "./tools/list-thoughts";
import { memoryRecallHandler } from "./tools/memory-recall";
import { memoryReviewHandler } from "./tools/memory-review";
import { memoryWritebackHandler } from "./tools/memory-writeback";
import { searchHandler } from "./tools/search";
import { searchThoughtsHandler } from "./tools/search-thoughts";
import { thoughtStatsHandler } from "./tools/thought-stats";
import type { ToolDeps, ToolEnvelope, ToolTextResult } from "./tools/types";

const SERVER_INFO = { name: "openbrains-mcp", version: "0.0.0" } as const;

type ToolHandler = (raw: unknown, env: ToolEnvelope) => Promise<ToolTextResult>;

interface ToolDef {
  name: string;
  description: string;
  input: AnySchema;
  output: AnySchema;
  handler: ToolHandler;
}

const TOOLS: readonly ToolDef[] = [
  {
    name: "capture_thought",
    description: "Capture a new thought (embed + dedupe by fingerprint + upsert).",
    input: captureThoughtInputSchema,
    output: captureThoughtOutputSchema,
    handler: captureThoughtHandler,
  },
  {
    name: "search_thoughts",
    description: "Semantic search over thoughts with score threshold and metadata filters.",
    input: searchThoughtsInputSchema,
    output: searchThoughtsOutputSchema,
    handler: searchThoughtsHandler,
  },
  {
    name: "list_thoughts",
    description: "Recent thoughts with optional days/type/topic/person filters.",
    input: listThoughtsInputSchema,
    output: listThoughtsOutputSchema,
    handler: listThoughtsHandler,
  },
  {
    name: "thought_stats",
    description: "Counts and top topics/people for the authenticated user.",
    input: thoughtStatsInputSchema,
    output: thoughtStatsOutputSchema,
    handler: thoughtStatsHandler,
  },
  {
    name: "search",
    description: "ChatGPT-connector-compatible search shape: returns [{id, title, url}].",
    input: searchInputSchema,
    output: searchOutputSchema,
    handler: searchHandler,
  },
  {
    name: "fetch",
    description: "ChatGPT-connector-compatible full-thought fetch by id.",
    input: fetchInputSchema,
    output: fetchOutputSchema,
    handler: fetchThoughtHandler,
  },
  {
    name: "memory_recall",
    description: "Recall thoughts with provenance and trust-grade for agent reasoning.",
    input: memoryRecallInputSchema,
    output: memoryRecallOutputSchema,
    handler: memoryRecallHandler,
  },
  {
    name: "memory_writeback",
    description: "Store agent-inferred memory at evidence grade by default.",
    input: memoryWritebackInputSchema,
    output: memoryWritebackOutputSchema,
    handler: memoryWritebackHandler,
  },
  {
    name: "memory_review",
    description: "Human review of a memory; only path to instruction-grade.",
    input: memoryReviewInputSchema,
    output: memoryReviewOutputSchema,
    handler: memoryReviewHandler,
  },
] as const;

export interface BuildServerInput {
  deps: ToolDeps;
  auth: AuthContext;
}

export function buildServer(input: BuildServerInput): McpServer {
  const server = new McpServer(SERVER_INFO);
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        outputSchema: tool.output,
      },
      // The MCP SDK passes parsed args; we re-validate via the shared schema
      // inside each handler (which is also called directly from tests).
      async (args: unknown): Promise<ToolTextResult> =>
        await tool.handler(args, { deps: input.deps, auth: input.auth }),
    );
  }
  return server;
}

export const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name);
