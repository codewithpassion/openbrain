import {
  type MemoryReviewInput,
  type MemoryReviewOutput,
  memoryReviewInputSchema,
  ThoughtId,
  type TrustGrade,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { ConvexReviewRequiredError } from "./deps/index";
import { assertUserId, parseInput, ReviewRequiresConfirmedError } from "./errors";

export async function memoryReview(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<MemoryReviewOutput> {
  assertUserId(userId);
  const input: MemoryReviewInput = parseInput(memoryReviewInputSchema, rawInput);
  const { thoughtId, status, promoteTo, note } = input;
  const promoteOnWire: "instruction" | undefined =
    promoteTo === "instruction" ? "instruction" : undefined;
  const thoughtIdRaw: string = thoughtId;
  try {
    const result = await deps.convex.memoryReview({
      userId,
      thoughtId: thoughtIdRaw,
      status,
      ...(promoteOnWire === undefined ? {} : { promoteTo: promoteOnWire }),
      ...(note === undefined ? {} : { note }),
    });
    const trustGrade: TrustGrade = result.promoted ? "instruction" : (promoteTo ?? "evidence");
    return { thoughtId: ThoughtId.parse(thoughtIdRaw), status, trustGrade };
  } catch (e) {
    if (e instanceof ConvexReviewRequiredError) {
      throw new ReviewRequiresConfirmedError();
    }
    throw e;
  }
}
