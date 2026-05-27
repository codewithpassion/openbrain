import { ThoughtId } from "@openbrains/shared";
import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface EditOptions {
  thoughtId: string;
  content: string;
  client: McpClientLike;
  flags: Flags;
}

/**
 * `ob edit <id> [--content "..." | -]` — replace a thought's content.
 * Re-fingerprints, re-embeds, re-upserts the Vectorize row.
 *
 * Reading from stdin (`-`) is wired in the dispatcher (index.ts) — this
 * function just sees the already-resolved content string.
 */
export async function runEdit(opts: EditOptions): Promise<number> {
  const result = await opts.client.updateThought({
    thoughtId: ThoughtId.parse(opts.thoughtId),
    content: opts.content,
  });
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  emit(`updated ${result.thoughtId}`);
  return 0;
}
