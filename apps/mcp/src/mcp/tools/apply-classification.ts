import { applyClassification, ServiceAuthError, ServiceInputError } from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function applyClassificationHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const output = await applyClassification(envelope.deps, envelope.auth.userId, rawInput);
    return ok({ type: output.type, applied: output.applied });
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (/not found/i.test(message)) {
      return err("thought not found");
    }
    throw e;
  }
}
