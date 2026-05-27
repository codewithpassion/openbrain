import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import {
  applyClassificationInputSchema,
  applyClassificationOutputSchema,
  applyEnrichmentInputSchema,
  applyEnrichmentOutputSchema,
  applySplitInputSchema,
  applySplitOutputSchema,
  captureThoughtInputSchema,
  captureThoughtOutputSchema,
  classifyThoughtInputSchema,
  classifyThoughtOutputSchema,
  createProjectInputSchema,
  createProjectOutputSchema,
  enrichThoughtInputSchema,
  enrichThoughtOutputSchema,
  entityRelationsInputSchema,
  entityRelationsOutputSchema,
  fetchInputSchema,
  fetchOutputSchema,
  getEntityInputSchema,
  getEntityOutputSchema,
  getSessionScopeInputSchema,
  getSessionScopeOutputSchema,
  listEntitiesInputSchema,
  listEntitiesOutputSchema,
  listProjectsInputSchema,
  listProjectsOutputSchema,
  listThoughtsInputSchema,
  listThoughtsOutputSchema,
  memoryRecallInputSchema,
  memoryRecallOutputSchema,
  memoryReviewInputSchema,
  memoryReviewOutputSchema,
  memoryWritebackInputSchema,
  memoryWritebackOutputSchema,
  panBrainDumpInputSchema,
  panBrainDumpOutputSchema,
  relatedThoughtsInputSchema,
  relatedThoughtsOutputSchema,
  searchInputSchema,
  searchOutputSchema,
  searchThoughtsInputSchema,
  searchThoughtsOutputSchema,
  setSessionScopeInputSchema,
  setSessionScopeOutputSchema,
  thoughtStatsInputSchema,
  thoughtStatsOutputSchema,
  updateThoughtInputSchema,
  updateThoughtOutputSchema,
} from "@openbrains/shared";
import type { AuthContext } from "../auth/types";
import { applyClassificationHandler } from "./tools/apply-classification";
import { applyEnrichmentHandler } from "./tools/apply-enrichment";
import { applySplitHandler } from "./tools/apply-split";
import { captureThoughtHandler } from "./tools/capture-thought";
import { classifyThoughtHandler } from "./tools/classify-thought";
import { createProjectHandler } from "./tools/create-project";
import { enrichThoughtHandler } from "./tools/enrich-thought";
import { entityRelationsHandler } from "./tools/entity-relations";
import { fetchThoughtHandler } from "./tools/fetch-thought";
import { getEntityHandler } from "./tools/get-entity";
import { listEntitiesHandler } from "./tools/list-entities";
import { listProjectsHandler } from "./tools/list-projects";
import { listThoughtsHandler } from "./tools/list-thoughts";
import { memoryRecallHandler } from "./tools/memory-recall";
import { memoryReviewHandler } from "./tools/memory-review";
import { memoryWritebackHandler } from "./tools/memory-writeback";
import { panBrainDumpHandler } from "./tools/pan-brain-dump";
import { relatedThoughtsHandler } from "./tools/related-thoughts";
import { searchHandler } from "./tools/search";
import { searchThoughtsHandler } from "./tools/search-thoughts";
import { getSessionScopeHandler, setSessionScopeHandler } from "./tools/session-scope";
import { thoughtStatsHandler } from "./tools/thought-stats";
import type { ToolDeps, ToolEnvelope, ToolTextResult } from "./tools/types";
import { updateThoughtHandler } from "./tools/update-thought";

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
  {
    name: "list_entities",
    description: "List entities (people/orgs/topics/...) for the authenticated user.",
    input: listEntitiesInputSchema,
    output: listEntitiesOutputSchema,
    handler: listEntitiesHandler,
  },
  {
    name: "get_entity",
    description: "Fetch one entity by id plus recent mentions.",
    input: getEntityInputSchema,
    output: getEntityOutputSchema,
    handler: getEntityHandler,
  },
  {
    name: "entity_relations",
    description: "Outgoing and incoming typed relations for an entity.",
    input: entityRelationsInputSchema,
    output: entityRelationsOutputSchema,
    handler: entityRelationsHandler,
  },
  {
    name: "classify_thought",
    description: "Use the LLM to classify a thought's `metadata.type`.",
    input: classifyThoughtInputSchema,
    output: classifyThoughtOutputSchema,
    handler: classifyThoughtHandler,
  },
  {
    name: "enrich_thought",
    description: "Use the LLM to compute richer metadata for a thought.",
    input: enrichThoughtInputSchema,
    output: enrichThoughtOutputSchema,
    handler: enrichThoughtHandler,
  },
  {
    name: "pan_brain_dump",
    description: "Split a freeform brain-dump into discrete idea candidates.",
    input: panBrainDumpInputSchema,
    output: panBrainDumpOutputSchema,
    handler: panBrainDumpHandler,
  },
  {
    name: "related_thoughts",
    description: "Find thoughts semantically similar to a given thought (excludes self).",
    input: relatedThoughtsInputSchema,
    output: relatedThoughtsOutputSchema,
    handler: relatedThoughtsHandler,
  },
  {
    name: "update_thought",
    description: "Replace a thought's content; re-embeds and re-upserts the vector.",
    input: updateThoughtInputSchema,
    output: updateThoughtOutputSchema,
    handler: updateThoughtHandler,
  },
  {
    name: "classify_thought_apply",
    description: "Classify a thought and persist `metadata.type` (fill-only — never overwrites).",
    input: applyClassificationInputSchema,
    output: applyClassificationOutputSchema,
    handler: applyClassificationHandler,
  },
  {
    name: "enrich_thought_apply",
    description: "Enrich a thought and merge LLM-inferred metadata into it.",
    input: applyEnrichmentInputSchema,
    output: applyEnrichmentOutputSchema,
    handler: applyEnrichmentHandler,
  },
  {
    name: "pan_brain_dump_apply",
    description: "Split a thought into idea candidates and persist each as a child thought.",
    input: applySplitInputSchema,
    output: applySplitOutputSchema,
    handler: applySplitHandler,
  },
  {
    name: "list_projects",
    description:
      "List the user's projects (scopes). Each thought can be tagged with a project slug.",
    input: listProjectsInputSchema,
    output: listProjectsOutputSchema,
    handler: listProjectsHandler,
  },
  {
    name: "create_project",
    description:
      "Create a new project (scope namespace). Slug must be lowercase alphanumeric with hyphens.",
    input: createProjectInputSchema,
    output: createProjectOutputSchema,
    handler: createProjectHandler,
  },
  {
    name: "set_session_scope",
    description:
      "Pin a default project scope for subsequent tool calls. Omit `scope` to clear the pin.",
    input: setSessionScopeInputSchema,
    output: setSessionScopeOutputSchema,
    handler: setSessionScopeHandler,
  },
  {
    name: "get_session_scope",
    description: "Read the currently pinned default project scope (or `null` if none).",
    input: getSessionScopeInputSchema,
    output: getSessionScopeOutputSchema,
    handler: getSessionScopeHandler,
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
