import { memoryReviewInputSchema, ThoughtId, type TrustGrade } from "@openbrains/shared";
import { ConvexReviewRequiredError } from "../../deps/convex";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Human (or human-authorized agent) review of a memory. The reviewer is
 * always the authenticated user; Convex derives it from the
 * `X-OpenBrains-User-Id` header. Promotion to a new trustGrade — including
 * `instruction` — flows through here, never through `memory-writeback`.
 *
 * The Convex endpoint accepts `promoteTo: "instruction"` only and gates it
 * on `status === "confirmed"`. A 422 `REQUIRES_REVIEW` is surfaced as a
 * tool-level error rather than a thrown exception.
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
  // The Convex side only accepts `promoteTo: "instruction"` (the other
  // grades are no-ops on the wire). Treat any non-instruction promoteTo as
  // absent at the HTTP boundary, but echo it back to the caller below.
  const promoteOnWire: "instruction" | undefined =
    promoteTo === "instruction" ? "instruction" : undefined;
  const userId = envelope.auth.userId;
  const thoughtIdRaw: string = thoughtId;
  try {
    const result = await envelope.deps.convex.memoryReview({
      userId,
      thoughtId: thoughtIdRaw,
      status,
      ...(promoteOnWire === undefined ? {} : { promoteTo: promoteOnWire }),
      ...(note === undefined ? {} : { note }),
    });
    // The server is the source of truth on the final trust grade.
    const trustGrade: TrustGrade = result.promoted ? "instruction" : (promoteTo ?? "evidence");
    return ok({ thoughtId: ThoughtId.parse(thoughtIdRaw), status, trustGrade });
  } catch (e) {
    if (e instanceof ConvexReviewRequiredError) {
      return err("promotion refused: status must be 'confirmed' to promote to instruction");
    }
    throw e;
  }
}
