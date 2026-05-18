/**
 * Props attached to an OAuth grant by `clerk-handler` and surfaced to the MCP
 * apiHandler via `ctx.props`. The MCP handler reads these via the agents'
 * `getMcpAuthContext()` helper or via the explicit `authContext` option.
 */
export interface AuthProps {
  /** Clerk userId (the `sub` claim of the Clerk ID token). */
  userId: string;
  /** Optional verified email, kept for downstream attribution if available. */
  email?: string;
}

/** Per-tool-call auth context. Constructed by the handler factory. */
export interface AuthContext {
  userId: string;
  email?: string;
}
