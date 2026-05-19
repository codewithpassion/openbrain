import {
  type ThoughtStatsInput,
  type ThoughtStatsOutput,
  thoughtStatsInputSchema,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

export async function thoughtStats(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<ThoughtStatsOutput> {
  assertUserId(userId);
  const _input: ThoughtStatsInput = parseInput(thoughtStatsInputSchema, rawInput);
  void _input; // `days` filter is not yet pushed through to Convex.
  const stats = await deps.convex.thoughtStats({ userId });
  return {
    total: stats.total,
    byType: stats.byType,
    topTopics: stats.topTopics,
    topPeople: stats.topPeople.map((p) => ({ person: p.name, count: p.count })),
  };
}
