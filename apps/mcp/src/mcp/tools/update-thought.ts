import { ServiceAuthError, ServiceInputError, updateThought } from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function updateThoughtHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const output = await updateThought(envelope.deps, envelope.auth.userId, rawInput);
    return ok(output);
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (/FINGERPRINT_COLLISION/.test(message)) {
      return err("FINGERPRINT_COLLISION: another thought already has this content");
    }
    if (/not found/i.test(message)) {
      return err("thought not found");
    }
    throw e;
  }
}
