import {
  type ClassifyThoughtInput,
  classifyThoughtInputSchema,
  type ThoughtType,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

const FALLBACK_TYPE: ThoughtType = "observation";

export interface ApplyClassificationResult {
  readonly type: ThoughtType;
  readonly applied: boolean;
}

/**
 * `classify_thought_apply` — runs the LLM extractor on a thought, then
 * persists `metadata.type` via `thoughts.setTypeInternal`. Fill-only: if the
 * thought already has a type, returns `applied: false` and leaves it alone.
 */
export async function applyClassification(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<ApplyClassificationResult> {
  assertUserId(userId);
  const input: ClassifyThoughtInput = parseInput(classifyThoughtInputSchema, rawInput);
  const rows = await deps.convex.getThoughtsByIds({
    userId,
    ids: [input.thoughtId],
  });
  const source = rows[0];
  if (source === undefined) {
    return { type: FALLBACK_TYPE, applied: false };
  }
  if (deps.metadata === undefined) {
    throw new Error("apply-classification requires a metadata extractor");
  }
  const metadata = await deps.metadata.extract(source.content);
  const type = (metadata.type ?? FALLBACK_TYPE) as ThoughtType;
  const { wrote } = await deps.convex.setThoughtType({
    userId,
    thoughtId: input.thoughtId,
    type,
  });
  return { type, applied: wrote };
}
