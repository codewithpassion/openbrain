import { ThoughtId } from "@openbrains/shared";
import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface EnrichOptions {
  thoughtId: string;
  apply: boolean;
  client: McpClientLike;
  flags: Flags;
}

/**
 * `ob enrich <id> [--apply]` — surface LLM-inferred metadata for a thought.
 * Without `--apply`, read-only. With `--apply`, merges the result into the
 * thought (union-for-arrays, fill-only for `type`).
 */
export async function runEnrich(opts: EnrichOptions): Promise<number> {
  const result = opts.apply
    ? await opts.client.applyEnrichment({ thoughtId: ThoughtId.parse(opts.thoughtId) })
    : await opts.client.enrichThought({ thoughtId: ThoughtId.parse(opts.thoughtId) });
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  const m = result.metadata;
  emit(`type: ${m.type ?? "(none)"}`);
  if (m.topics.length > 0) {
    emit(`topics: ${m.topics.join(", ")}`);
  }
  if (m.people.length > 0) {
    emit(`people: ${m.people.join(", ")}`);
  }
  if (m.action_items.length > 0) {
    emit("action items:");
    for (const a of m.action_items) {
      emit(`  - ${a}`);
    }
  }
  if (m.dates_mentioned.length > 0) {
    emit(`dates: ${m.dates_mentioned.join(", ")}`);
  }
  return 0;
}
