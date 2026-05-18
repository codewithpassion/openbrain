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

## HTTP endpoints (MCP Worker surface)

All endpoints require both headers (`X-OpenBrains-Internal-Secret` matching
`INTERNAL_API_SECRET`, `X-OpenBrains-User-Id` from the OAuth token) and return
JSON. Missing/wrong secret → 401 with no body. Secret OK but user-id missing
→ 400.

| Method | Path | Body / Query | Returns |
| --- | --- | --- | --- |
| POST | `/api/thoughts` | `{ content, source, embeddingModel, embeddingDims, fingerprint, metadata }` | `{ id }` |
| POST | `/api/thoughts/search` | `{ ids: string[] }` | `{ rows: Thought[] }` |
| GET | `/api/thoughts` | `?limit=N` | `{ rows: Thought[] }` (legacy; prefer `/list`) |
| POST | `/api/thoughts/list` | `{ limit?, type?, topic?, person?, days? }` | `{ rows: Thought[] }` |
| POST | `/api/thoughts/by-fingerprint` | `{ fingerprint }` | `{ thought: Thought \| null }` |
| GET | `/api/thoughts/stats` | — | `{ total, byType, topTopics, topPeople }` |
| POST | `/api/memory/recall` | `{ thoughtIds, query?, scores? }` | `{ items: { thought, provenance, usePolicy }[] }` |
| POST | `/api/memory/writeback` | `{ ...thought, provenance: { origin, agent?, ... }, scopes? }` | `{ thoughtId }` |
| POST | `/api/memory/review` | `{ thoughtId, status, note?, promoteTo? }` | `{ reviewId, promoted }` |

### Filter pushdown (`/api/thoughts/list`)

`userId` is pushed down via the `by_user_created` index. `type` and `days`
push down through `.filter()`. `topic` and `person` filter in JS over the
index-scoped result — Convex's expression DSL has no native array-contains.
The cost is bounded by the per-user row count; a denormalized
topic/person-by-user index is the v2 fix.

### Recall traces (`/api/memory/recall`)

The recall endpoint writes one `memory_recall_traces` row per *kept* thought —
cross-tenant ids are silently dropped (no existence leak) and never produce a
trace. The internal mutation runs the join and trace writes in a single Convex
transaction so the audit trail is always consistent with what the client saw.

The MCP Worker may not yet send `query`/`scores` (vector search context).
Both are optional in the request; when absent the trace records `query=""`
and `score=0`. Worker upgrade is tracked separately.

### Writeback trust grade (`/api/memory/writeback`)

CLAUDE.md §7 mandates that the writeback path always writes
`trustGrade: "evidence"`. The internal mutation has **no** `trustGrade`
argument — any incoming field by that name is structurally ignored. The only
path to `instruction` is `POST /api/memory/review` with
`status: "confirmed"` + `promoteTo: "instruction"`. That endpoint returns 422
`{ error: "REQUIRES_REVIEW" }` if the gate is violated.

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
