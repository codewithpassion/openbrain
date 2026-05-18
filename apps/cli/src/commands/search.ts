import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface SearchOptions {
  query: string;
  limit?: number;
  client: McpClientLike;
  flags: Flags;
}

export async function runSearch(opts: SearchOptions): Promise<number> {
  const result = await opts.client.searchThoughts({
    query: opts.query,
    limit: opts.limit ?? 10,
    threshold: 0.5,
  });
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  if (result.results.length === 0) {
    emit("No matches.");
    return 0;
  }
  for (const r of result.results) {
    emit(`[${r.score.toFixed(2)}] ${r.id}  ${r.content.replace(/\s+/g, " ").slice(0, 100)}`);
  }
  return 0;
}
