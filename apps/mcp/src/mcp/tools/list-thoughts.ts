import { listThoughts, ServiceAuthError, ServiceInputError } from "@openbrains/services";
import { withSessionDefaultScope } from "../session-scope-store";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function listThoughtsHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const withDefault = await withSessionDefaultScope(
      rawInput,
      envelope.deps.sessionScope,
      envelope.auth.userId,
    );
    const out = await listThoughts(envelope.deps, envelope.auth.userId, withDefault);
    return ok(out);
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    throw e;
  }
}
