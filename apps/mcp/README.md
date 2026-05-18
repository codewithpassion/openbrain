# @openbrains/mcp

Cloudflare Worker hosting the OpenBrains MCP server with OAuth 2.1 (Clerk-delegated).

## What it serves

| Route | Purpose |
| --- | --- |
| `/mcp` | MCP Streamable HTTP — tools listed below. Requires a valid OAuth bearer. |
| `/authorize`, `/token`, `/register` | OAuth provider endpoints (handled by `@cloudflare/workers-oauth-provider`). |
| `/callback` | Clerk OAuth callback. |
| `/.well-known/...` | Provider metadata. |

### Tools (v1)

`capture_thought`, `search_thoughts`, `list_thoughts`, `thought_stats`,
`search` (ChatGPT-compat), `fetch` (ChatGPT-compat),
`memory_recall`, `memory_writeback`, `memory_review`.

Schemas live in `@openbrains/shared/tools` — this app does **not** redefine them.

## Local dev

The user's global rules say wrangler env files use `.env*` (not `.dev.vars`). Create:

```
apps/mcp/.env.local        # NOT committed
```

```bash
# .env.local
CONVEX_URL=https://your-deployment.convex.cloud
CLERK_DOMAIN=your-tenant.clerk.accounts.dev
EMBEDDING_MODEL=@cf/qwen/qwen3-embedding-0.6b
CLERK_JWKS_URL=https://your-tenant.clerk.accounts.dev/.well-known/jwks.json
CLERK_CLIENT_ID=...
CLERK_CLIENT_SECRET=...
INTERNAL_API_SECRET=match-the-convex-side
```

Provision a KV namespace and put its id in `wrangler.jsonc`:

```bash
bunx wrangler kv namespace create OAUTH_KV
# paste the id into wrangler.jsonc → kv_namespaces[].id
```

Then:

```bash
bun --filter @openbrains/mcp dev
```

## Tests

```bash
bun --filter @openbrains/mcp test
```

All tests run offline against in-memory fakes (`tests/helpers/fakes.ts`). No
real Clerk, Convex, or Vectorize call is made.

## Production wiring

| Binding | Provisioning |
| --- | --- |
| `AI` | Automatic for any account with Workers AI enabled. |
| `VECTORIZE` | `bunx wrangler vectorize create thoughts-v1 --dimensions=1024 --metric=cosine` (see ARCHITECTURE.md). |
| `OAUTH_KV` | `bunx wrangler kv namespace create OAUTH_KV`. |
| Secrets | `bunx wrangler secret put CLERK_JWKS_URL`, `CLERK_CLIENT_ID`, `CLERK_CLIENT_SECRET`, `INTERNAL_API_SECRET`. |

The Clerk app must be configured as an OAuth provider with the callback URL
`https://<worker-host>/callback` and scopes `openid email profile`. The Convex
deployment must expose `convex/http.ts` and have `INTERNAL_API_SECRET` set to
the same value as this Worker.

## Trust boundary

This Worker is the **only** place where the userId is resolved from a token.
Every outbound call to Convex carries:

- `X-OpenBrains-User-Id: <clerk-userId>`
- `X-OpenBrains-Internal-Secret: <shared secret>`

Every Vectorize call sets `namespace = userId`. Tests assert both per call —
see `tests/deps/convex.test.ts` and `tests/deps/vectorize.test.ts`.

## Known deviations from `packages/convex/convex/http.ts`

The MCP tool surface is wider than the Convex HTTP surface today. The Worker
encodes the deltas via its `ConvexClient` interface; production rollout needs
the Convex side to grow matching endpoints. See inline `DEVIATION:` comments
in `src/mcp/tools/*` and `src/deps/convex.ts`. Tracked items:

1. `capture-thought` calls `getByFingerprint`; needs `/api/thoughts/by-fingerprint`.
2. `memory-recall` defaults `trustGrade=evidence`, `origin=human`; needs a join
   with `memory_provenance` + `memory_use_policy` in `/api/memory/recall`.
3. `memory-writeback` accepts `trustGrade` and `scopes` from the tool but
   `/api/memory/writeback` doesn't yet persist them on `memory_use_policy`.
4. `memory-review`'s `promoteTo` is not applied server-side yet.
5. `thought-stats` returns `topPeople: []`; needs aggregation in
   `/api/thoughts/stats`.
6. `list-thoughts` filters by `days/type/topic/person` client-side; pushdown
   would lower egress.
