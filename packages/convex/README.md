# @openbrains/convex

Convex schema and functions for OpenBrains. Owns the `thoughts` table, the six
Agent Memory sidecars (`memory_provenance`, `memory_review`, `memory_use_policy`,
`memory_source_refs`, `memory_recall_traces`, `memory_audit`) and `api_keys`.
Every public query and mutation begins with `requireUserId(ctx)` and indexes by
`userId` — see CLAUDE.md §6.

## Security model

Two trust boundaries enter Convex:

- **Dashboard / direct Clerk JWT.** `ctx.auth.getUserIdentity()` resolves the
  Clerk userId; all public queries and mutations use this path via
  `requireUserId`.
- **MCP Worker via HTTP actions (`convex/http.ts`).** The Worker resolves the
  Clerk userId from its OAuth token and forwards two headers:
  `X-OpenBrains-Internal-Secret` (must match the `INTERNAL_API_SECRET` env var,
  compared with a constant-time check) and `X-OpenBrains-User-Id` (the userId
  the body is bound to). HTTP actions trust the user-id header **only** when
  the internal secret matches; otherwise every endpoint returns 401 with no
  body. From there they call `internal*` mutations/queries that take an
  explicit `userId` argument.

`apiKeys.verify` is the documented exception to the identity rule: it
establishes identity from a hash and so must be callable without one. It
returns `null` (never the row) for unknown or expired keys.

Trust grade defaults to `evidence`; promotion to `instruction` is gated on a
confirmed `memory_review` row (see `memory/review.ts#promote`).

## Layout

```
convex/
  schema.ts              tables + indexes
  auth.config.ts         Clerk JWT provider config
  _generated/            hand-written stand-ins for `convex codegen` (offline)
  _lib/identity.ts       requireUserId
  _lib/audit.ts          writeAudit
  thoughts.ts            thoughts CRUD + internal* helpers for HTTP
  apiKeys.ts             mint / verify / revoke / list
  memory/                six sidecar modules
  http.ts                HTTP actions for the MCP Worker
tests/                   convex-test + bun:test
```
