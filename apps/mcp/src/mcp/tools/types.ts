import type { BrainDumpSplitter, EmbeddingAdapter, MetadataExtractor } from "@openbrains/ingest";
import type { AuthContext } from "../../auth/types";
import type { ConvexClient } from "../../deps/convex";
import type { VectorizeClient } from "../../deps/vectorize";
import type { SessionScopeStore } from "../session-scope-store";

export interface ToolDeps {
  convex: ConvexClient;
  vectorize: VectorizeClient;
  embeddings: EmbeddingAdapter;
  metadata: MetadataExtractor;
  splitter: BrainDumpSplitter;
  /**
   * Per-user pinned default scope. Optional so existing tests that don't
   * exercise the scope-default path don't need to wire one through; absent
   * means "no default" (handlers fall through to the tool input's scope or
   * unscoped). The Worker handler always provides a real one.
   */
  sessionScope?: SessionScopeStore;
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
