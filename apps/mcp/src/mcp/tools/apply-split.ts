import { applySplit, ServiceAuthError, ServiceInputError } from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function applySplitHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const output = await applySplit(envelope.deps, envelope.auth.userId, rawInput);
    return ok({ created: output.created, childIds: [...output.childIds] });
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (/not found/i.test(message)) {
      return err("parent thought not found");
    }
    throw e;
  }
}
