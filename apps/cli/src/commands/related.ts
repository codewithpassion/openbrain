import { ThoughtId } from "@openbrains/shared";
import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface RelatedOptions {
  thoughtId: string;
  limit?: number;
  threshold?: number;
  client: McpClientLike;
  flags: Flags;
}

/**
 * `ob related <id> [-n N] [--threshold 0.85]` — find thoughts semantically
 * similar to the given thought. The source thought itself is excluded.
 */
export async function runRelated(opts: RelatedOptions): Promise<number> {
  const input: {
    thoughtId: ReturnType<typeof ThoughtId.parse>;
    limit: number;
    threshold: number;
  } = {
    thoughtId: ThoughtId.parse(opts.thoughtId),
    limit: opts.limit ?? 10,
    threshold: opts.threshold ?? 0.85,
  };
  const result = await opts.client.relatedThoughts(input);
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  if (result.results.length === 0) {
    emit("No related thoughts above threshold.");
    return 0;
  }
  for (const r of result.results) {
    emit(`[${r.score.toFixed(2)}] ${r.id}  ${r.content.replace(/\s+/g, " ").slice(0, 100)}`);
  }
  return 0;
}
