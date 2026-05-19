import { captureThought, ServiceAuthError, ServiceInputError } from "@openbrains/services";
import { ThoughtId } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function captureThoughtHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const out = await captureThought(envelope.deps, envelope.auth.userId, rawInput);
    return ok({ thoughtId: ThoughtId.parse(out.thoughtId), duplicate: out.duplicate });
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    throw e;
  }
}
