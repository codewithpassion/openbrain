import {
  type SearchInput,
  type SearchOutput,
  searchInputSchema,
  ThoughtId,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

const DEFAULT_TOPK = 10;
const TITLE_MAX = 80;

function makeTitle(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length <= TITLE_MAX ? oneLine : `${oneLine.slice(0, TITLE_MAX - 1)}…`;
}

/**
 * ChatGPT/connector-compat: returns `[{ id, title, url }]` for the top-K
 * matches. Use `searchThoughts` for the richer shape with scores + content.
 */
export async function search(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<SearchOutput> {
  assertUserId(userId);
  const input: SearchInput = parseInput(searchInputSchema, rawInput);
  const embedding = await deps.embeddings.embed(input.query);
  const matches = await deps.vectorize.query({
    userId,
    values: embedding.vector,
    topK: DEFAULT_TOPK,
  });
  if (matches.length === 0) {
    return { results: [] };
  }
  const rows = await deps.convex.getThoughtsByIds({
    userId,
    ids: matches.map((m) => m.id),
  });
  const byId = new Map(rows.map((r) => [r._id, r] as const));
  const results = matches
    .map((m) => {
      const row = byId.get(m.id);
      if (row === undefined) {
        return null;
      }
      return {
        id: ThoughtId.parse(row._id),
        title: makeTitle(row.content),
        url: `openbrains://thoughts/${row._id}`,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return { results };
}
