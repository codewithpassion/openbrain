import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface StatsOptions {
  client: McpClientLike;
  flags: Flags;
}

export async function runStats(opts: StatsOptions): Promise<number> {
  const result = await opts.client.thoughtStats();
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  emit(`Total thoughts: ${result.total}`);
  const types = Object.entries(result.byType);
  if (types.length > 0) {
    emit("By type:");
    for (const [k, v] of types) {
      emit(`  ${k}: ${v}`);
    }
  }
  if (result.topTopics.length > 0) {
    emit(`Top topics: ${result.topTopics.map((t) => `${t.topic}(${t.count})`).join(", ")}`);
  }
  if (result.topPeople.length > 0) {
    emit(`Top people: ${result.topPeople.map((p) => `${p.person}(${p.count})`).join(", ")}`);
  }
  return 0;
}
