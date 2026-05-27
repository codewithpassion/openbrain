import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface PanOptions {
  content?: string;
  thoughtId?: string;
  apply: boolean;
  maxIdeas: number;
  client: McpClientLike;
  flags: Flags;
}

/**
 * `ob pan <content>` — split a brain-dump into discrete idea candidates.
 *
 * Without `--apply`: read-only. Takes raw `<content>`; returns idea list.
 * With `--apply`: takes a `<thoughtId>` and persists each idea as a child
 * thought via `pan_brain_dump_apply`. The two paths take different inputs
 * because applying requires an existing thought to attach children to.
 */
export async function runPan(opts: PanOptions): Promise<number> {
  if (opts.apply) {
    if (opts.thoughtId === undefined) {
      throw new Error("--apply requires a thoughtId positional");
    }
    const { ThoughtId } = await import("@openbrains/shared");
    const result = await opts.client.applySplit({
      thoughtId: ThoughtId.parse(opts.thoughtId),
      maxIdeas: opts.maxIdeas,
    });
    if (isJsonFlag(opts.flags)) {
      emitJson(result);
      return 0;
    }
    emit(`created ${result.created.toString()} child thought(s)`);
    for (const id of result.childIds) {
      emit(`  - ${id}`);
    }
    return 0;
  }
  if (opts.content === undefined) {
    throw new Error("pan requires <content> when not using --apply");
  }
  const result = await opts.client.panBrainDump({
    content: opts.content,
    maxIdeas: opts.maxIdeas,
  });
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  if (result.ideas.length === 0) {
    emit("No ideas extracted.");
    return 0;
  }
  for (const idea of result.ideas) {
    const prefix = idea.type === undefined ? "" : `[${idea.type}] `;
    const topics = idea.topics.length === 0 ? "" : ` (${idea.topics.join(", ")})`;
    emit(`- ${prefix}${idea.content}${topics}`);
  }
  return 0;
}
