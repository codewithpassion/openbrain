import {
  type ListThoughtsInput,
  type ListThoughtsOutput,
  listThoughtsInputSchema,
  ThoughtId,
  type ThoughtType,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

const ALLOWED_TYPES: readonly ThoughtType[] = [
  "observation",
  "task",
  "idea",
  "reference",
  "person_note",
];

export async function listThoughts(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<ListThoughtsOutput> {
  assertUserId(userId);
  const input: ListThoughtsInput = parseInput(listThoughtsInputSchema, rawInput);
  const { limit, days, type, topic, person, scope } = input;
  const rows = await deps.convex.listThoughts({
    userId,
    limit,
    ...(type === undefined ? {} : { type }),
    ...(topic === undefined ? {} : { topic }),
    ...(person === undefined ? {} : { person }),
    ...(days === undefined ? {} : { days }),
    ...(scope === undefined ? {} : { scope }),
  });
  const thoughts = rows.map((row) => {
    const out: {
      id: ThoughtId;
      content: string;
      source: string;
      createdAt: number;
      type?: ThoughtType;
    } = {
      id: ThoughtId.parse(row._id),
      content: row.content,
      source: row.source,
      createdAt: row.createdAt,
    };
    if (
      row.metadata.type !== undefined &&
      (ALLOWED_TYPES as readonly string[]).includes(row.metadata.type)
    ) {
      out.type = row.metadata.type as ThoughtType;
    }
    return out;
  });
  return { thoughts };
}
