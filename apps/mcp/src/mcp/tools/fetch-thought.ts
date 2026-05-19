import {
  fetchThought,
  ServiceAuthError,
  ServiceInputError,
  ServiceNotFoundError,
} from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function fetchThoughtHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const out = await fetchThought(envelope.deps, envelope.auth.userId, rawInput);
    return ok(out);
  } catch (e) {
    if (
      e instanceof ServiceAuthError ||
      e instanceof ServiceInputError ||
      e instanceof ServiceNotFoundError
    ) {
      return err(e.message);
    }
    throw e;
  }
}
