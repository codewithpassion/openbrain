import { ProjectSlug } from "@openbrains/shared";
import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface RecallOptions {
  query: string;
  limit?: number;
  scope?: string;
  client: McpClientLike;
  flags: Flags;
}

export async function runRecall(opts: RecallOptions): Promise<number> {
  const result = await opts.client.memoryRecall({
    query: opts.query,
    limit: opts.limit ?? 10,
    threshold: 0.5,
    ...(opts.scope === undefined ? {} : { scope: ProjectSlug.parse(opts.scope) }),
  });
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  if (result.results.length === 0) {
    emit("No memories recalled.");
    return 0;
  }
  for (const r of result.results) {
    emit(
      `[${r.score.toFixed(2)}] ${r.trustGrade}/${r.origin}  ${r.content
        .replace(/\s+/g, " ")
        .slice(0, 100)}`,
    );
  }
  return 0;
}
