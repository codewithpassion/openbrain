import { ThoughtId } from "@openbrains/shared";
import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface ClassifyOptions {
  thoughtId: string;
  apply: boolean;
  client: McpClientLike;
  flags: Flags;
}

/**
 * `ob classify <id> [--apply]` — surface the LLM-inferred `metadata.type` for
 * a thought. Without `--apply`, read-only. With `--apply`, also persists the
 * type via `classify_thought_apply` (fill-only — leaves an existing type
 * alone).
 */
export async function runClassify(opts: ClassifyOptions): Promise<number> {
  if (opts.apply) {
    const result = await opts.client.applyClassification({
      thoughtId: ThoughtId.parse(opts.thoughtId),
    });
    if (isJsonFlag(opts.flags)) {
      emitJson(result);
      return 0;
    }
    emit(`type: ${result.type}${result.applied ? " (applied)" : " (no-op: already set)"}`);
    return 0;
  }
  const result = await opts.client.classifyThought({
    thoughtId: ThoughtId.parse(opts.thoughtId),
  });
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  emit(`type: ${result.type}`);
  return 0;
}
