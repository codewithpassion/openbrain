import {
  type GetSessionScopeOutput,
  ProjectSlug,
  type SetSessionScopeOutput,
  setSessionScopeInputSchema,
} from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

export async function setSessionScopeHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing userId");
  }
  const store = envelope.deps.sessionScope;
  if (store === undefined) {
    return err("session scope store is not configured");
  }
  const parsed = setSessionScopeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.issues[0]?.message ?? "schema error"}`);
  }
  const next = parsed.data.scope === undefined ? null : parsed.data.scope;
  await store.set(envelope.auth.userId, next);
  const out: SetSessionScopeOutput = {
    scope: next === null ? null : ProjectSlug.parse(next),
  };
  return ok(out);
}

export async function getSessionScopeHandler(
  _rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing userId");
  }
  const store = envelope.deps.sessionScope;
  if (store === undefined) {
    return err("session scope store is not configured");
  }
  const raw = await store.get(envelope.auth.userId);
  const out: GetSessionScopeOutput = {
    scope: raw === null ? null : ProjectSlug.parse(raw),
  };
  return ok(out);
}
