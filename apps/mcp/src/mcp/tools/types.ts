import type { BrainDumpSplitter, EmbeddingAdapter, MetadataExtractor } from "@openbrains/ingest";
import type { AuthContext } from "../../auth/types";
import type { ConvexClient } from "../../deps/convex";
import type { VectorizeClient } from "../../deps/vectorize";

export interface ToolDeps {
  convex: ConvexClient;
  vectorize: VectorizeClient;
  embeddings: EmbeddingAdapter;
  metadata: MetadataExtractor;
  splitter: BrainDumpSplitter;
}

export interface ToolEnvelope {
  deps: ToolDeps;
  auth: AuthContext;
}

export interface ToolTextResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

export function ok(structured: Record<string, unknown>): ToolTextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

export function err(message: string): ToolTextResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
