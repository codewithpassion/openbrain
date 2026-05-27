import { z } from "zod";
import { ProjectSlug } from "../ids";

/**
 * `set_session_scope` — pin a default project scope for subsequent tool calls.
 *
 * Calling with no `scope` clears the pin. The default applies whenever a tool
 * input doesn't carry an explicit `scope` of its own. Tool inputs always win.
 *
 * `get_session_scope` reads the current pin (or `null`).
 *
 * Storage is keyed by the OAuth identity (userId): all of one user's
 * connected AI clients share the same default. This trades per-client
 * isolation for "set it once, recall everywhere" ergonomics.
 */
export const setSessionScopeInputSchema = z.object({
  scope: ProjectSlug.optional(),
});
export type SetSessionScopeInput = z.infer<typeof setSessionScopeInputSchema>;

export const setSessionScopeOutputSchema = z.object({
  scope: ProjectSlug.nullable(),
});
export type SetSessionScopeOutput = z.infer<typeof setSessionScopeOutputSchema>;

export const getSessionScopeInputSchema = z.object({});
export type GetSessionScopeInput = z.infer<typeof getSessionScopeInputSchema>;

export const getSessionScopeOutputSchema = z.object({
  scope: ProjectSlug.nullable(),
});
export type GetSessionScopeOutput = z.infer<typeof getSessionScopeOutputSchema>;
