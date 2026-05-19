import {
  memoryReview,
  ReviewRequiresConfirmedError,
  ServiceAuthError,
  ServiceInputError,
} from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function memoryReviewHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const out = await memoryReview(envelope.deps, envelope.auth.userId, rawInput);
    return ok(out);
  } catch (e) {
    if (
      e instanceof ServiceAuthError ||
      e instanceof ServiceInputError ||
      e instanceof ReviewRequiresConfirmedError
    ) {
      return err(e.message);
    }
    throw e;
  }
}
