import type { TrustGrade } from "@openbrains/shared";
import { memoryReviewInputSchema, ThoughtId } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Human (or human-authorized agent) review of a memory. The reviewer is
 * always the authenticated user. Promotion to a new trustGrade — including
 * `instruction` — flows through here, never through `memory-writeback`.
 *
 * DEVIATION: `/api/memory/review` does not currently apply `promoteTo` to a
 * `memory_use_policy` row. The Worker echoes the requested grade back; the
 * Convex side will need to grow that surface (open item).
 */
export async function memoryReviewHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = memoryReviewInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const { thoughtId, status, promoteTo, note } = parsed.data;
  const userId = envelope.auth.userId;
  const thoughtIdRaw: string = thoughtId;
  const reviewArgs: {
    userId: string;
    thoughtId: string;
    status: typeof status;
    reviewer: string;
    promoteTo?: TrustGrade;
    note?: string;
  } = {
    userId,
    thoughtId: thoughtIdRaw,
    status,
    reviewer: userId,
  };
  if (promoteTo !== undefined) {
    reviewArgs.promoteTo = promoteTo;
  }
  if (note !== undefined) {
    reviewArgs.note = note;
  }
  await envelope.deps.convex.memoryReview(reviewArgs);
  const trustGrade: TrustGrade = promoteTo ?? "evidence";
  return ok({ thoughtId: ThoughtId.parse(thoughtIdRaw), status, trustGrade });
}
