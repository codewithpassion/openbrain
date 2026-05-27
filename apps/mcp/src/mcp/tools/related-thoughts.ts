import { relatedThoughts, ServiceAuthError, ServiceInputError } from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function relatedThoughtsHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const output = await relatedThoughts(envelope.deps, envelope.auth.userId, rawInput);
    return ok(output);
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    throw e;
  }
}
