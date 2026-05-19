import { type FetchInput, type FetchOutput, fetchInputSchema, ThoughtId } from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput, ServiceNotFoundError } from "./errors";

const TITLE_MAX = 80;

function makeTitle(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length <= TITLE_MAX ? oneLine : `${oneLine.slice(0, TITLE_MAX - 1)}…`;
}

export async function fetchThought(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<FetchOutput> {
  assertUserId(userId);
  const input: FetchInput = parseInput(fetchInputSchema, rawInput);
  const id: string = input.id;
  const rows = await deps.convex.getThoughtsByIds({ userId, ids: [id] });
  const row = rows[0];
  if (row === undefined) {
    throw new ServiceNotFoundError(`thought not found: ${id}`);
  }
  return {
    id: ThoughtId.parse(row._id),
    title: makeTitle(row.content),
    text: row.content,
    url: `openbrains://thoughts/${row._id}`,
    metadata: {
      source: row.source,
      createdAt: row.createdAt,
      ...(row.metadata.type === undefined ? {} : { type: row.metadata.type }),
      topics: row.metadata.topics,
      people: row.metadata.people,
    },
  };
}
