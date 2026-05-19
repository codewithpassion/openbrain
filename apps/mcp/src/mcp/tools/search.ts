import { ServiceAuthError, ServiceInputError, search } from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/** ChatGPT/connector compatibility — returns `[{id, title, url}]`. */
export async function searchHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const out = await search(envelope.deps, envelope.auth.userId, rawInput);
    return ok(out);
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    throw e;
  }
}
