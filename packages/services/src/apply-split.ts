import { type ApplySplitInput, applySplitInputSchema } from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

export interface ApplySplitResult {
  readonly created: number;
  readonly childIds: readonly string[];
}

/**
 * `pan_brain_dump_apply` — runs the LLM splitter on a thought's content,
 * then persists each idea as a child thought via
 * `thoughts.persistSplitInternal`. Idempotent on `(parentThoughtId, content)`
 * via the derived child fingerprint — re-running for the same dump returns
 * the existing children without duplicating.
 */
export async function applySplit(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<ApplySplitResult> {
  assertUserId(userId);
  const input: ApplySplitInput = parseInput(applySplitInputSchema, rawInput);
  const rows = await deps.convex.getThoughtsByIds({
    userId,
    ids: [input.thoughtId],
  });
  const parent = rows[0];
  if (parent === undefined) {
    return { created: 0, childIds: [] };
  }
  if (deps.splitter === undefined) {
    throw new Error("apply-split requires a brain-dump splitter");
  }
  const ideas = await deps.splitter.split(parent.content, input.maxIdeas);
  return await deps.convex.persistSplit({
    userId,
    parentThoughtId: input.thoughtId,
    ideas: ideas.map((i) => ({
      content: i.content,
      ...(i.type === undefined ? {} : { type: i.type }),
      topics: [...i.topics],
    })),
  });
}
