import { createProject, ServiceAuthError, ServiceInputError } from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function createProjectHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const out = await createProject(envelope.deps, envelope.auth.userId, rawInput);
    return ok(out);
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (/SLUG_TAKEN/.test(message)) {
      return err("SLUG_TAKEN");
    }
    if (/INVALID_SLUG/.test(message)) {
      return err("INVALID_SLUG");
    }
    throw e;
  }
}
