import { listProjects, ServiceAuthError, ServiceInputError } from "@openbrains/services";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function listProjectsHandler(
  _rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  try {
    const out = await listProjects(envelope.deps, envelope.auth.userId);
    return ok(out);
  } catch (e) {
    if (e instanceof ServiceAuthError || e instanceof ServiceInputError) {
      return err(e.message);
    }
    throw e;
  }
}
