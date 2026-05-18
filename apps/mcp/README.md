# @openbrains/mcp

Cloudflare Worker hosting the OpenBrains MCP server with OAuth 2.1 (Clerk-delegated).

## What it serves

| Route | Purpose |
| --- | --- |
| `/mcp` | MCP Streamable HTTP — tools listed below. Requires a valid OAuth bearer. |
| `/authorize`, `/token`, `/register` | OAuth provider endpoints (handled by `@cloudflare/workers-oauth-provider`). |
| `/callback` | Clerk OAuth callback. |
| `/.well-known/...` | Provider metadata. |
| `POST /device_authorization` | RFC 8628 device-flow start (no auth). |
| `POST /token` (with `grant_type=urn:ietf:params:oauth:grant-type:device_code`) | RFC 8628 token grant. |
| `GET /device`, `GET /device/start`, `POST /device/approve`, `POST /device/deny` | User-side approval for the device flow. |

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
# HMAC secret used to sign device-flow bearer tokens AND the approval-page
# session cookie. 32+ random bytes; rotate by re-deploying.
DEVICE_FLOW_SECRET=...
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
bun --filter @openbrains/mcp test               # Bun unit tests (default)
bun --filter @openbrains/mcp test:integration   # vitest-pool-workers, Miniflare
```

Unit tests run offline against in-memory fakes (`tests/helpers/fakes.ts`). No
real Clerk, Convex, or Vectorize call is made.

Integration tests under `tests/integration/` boot the Worker inside Miniflare
via `@cloudflare/vitest-pool-workers`. They are NOT part of `bun run check`
because they require a separate runner; run them locally before deploying.
The miniflare config in `vitest.config.ts` deliberately omits the `AI` and
`VECTORIZE` bindings (those are remote-only and would force a Cloudflare
account login); the OAuth + device-flow surface used by the integration test
doesn't touch them.

## Device flow (RFC 8628) for the `ob` CLI

The CLI runs the OAuth Device Authorization Grant against this Worker. The
endpoint shapes match `apps/cli/src/auth/device-flow.ts` exactly.

### Endpoints

- `POST /device_authorization` (form-encoded, no auth): returns
  `{ device_code, user_code, verification_uri, verification_uri_complete,
     expires_in, interval }`.
- `POST /token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`:
  returns one of `authorization_pending`, `slow_down`, `access_denied`,
  `expired_token`, or `{ access_token, token_type: "bearer", expires_in,
  scope }`.
- `GET /device?user_code=XXXX-XXXX`: the user-facing approval page.
- `GET /device/start?user_code=...`: redirects to Clerk sign-in for the
  approval flow.
- `POST /device/approve`, `POST /device/deny`: form-encoded with `user_code`,
  authenticated by a short-lived HMAC-signed cookie set by `/callback` when
  the stashed state has `intent: "device_approve"`.

### Worked example with `curl`

```bash
# 1. Start the device-flow handshake.
$ curl -s -X POST https://ob-mcp.openbrains.dev/device_authorization \
       -H 'content-type: application/x-www-form-urlencoded' \
       -d 'client_id=ob-cli&scope=openid+email'
{
  "device_code": "g7K3...",
  "user_code": "WXYZ-1234",
  "verification_uri": "https://ob-mcp.openbrains.dev/device",
  "verification_uri_complete": "https://ob-mcp.openbrains.dev/device?user_code=WXYZ-1234",
  "expires_in": 900,
  "interval": 5
}

# 2. The user opens verification_uri_complete in a browser, signs in via Clerk,
#    and clicks "Approve".

# 3. The CLI polls the token endpoint.
$ curl -s -X POST https://ob-mcp.openbrains.dev/token \
       -H 'content-type: application/x-www-form-urlencoded' \
       -d 'grant_type=urn:ietf:params:oauth:grant-type:device_code' \
       -d 'device_code=g7K3...' \
       -d 'client_id=ob-cli'
{ "error": "authorization_pending" }      # before the user clicks Approve
{ "access_token": "obdev_eyJ...", "token_type": "bearer", "expires_in": 3600, "scope": "openid email" }
```

### Token shape

Device-flow access tokens are HMAC-signed self-contained bearers prefixed
`obdev_`. The Worker's `resolveExternalToken` callback verifies the signature
and surfaces `{ userId, email }` as `ctx.props` for the MCP `apiHandler`. The
OAuthProvider's authorization-code flow is unchanged and uses the provider's
own opaque tokens — both paths populate `ctx.props` the same way.

### Limitations

- **No refresh tokens** for device-flow bearers. The CLI re-runs `ob login` on
  401. (Authorization-code-grant tokens issued by the OAuthProvider do support
  refresh as before; this limitation applies only to the device-flow path.)
- We deliberately do NOT round-trip device-flow approvals through
  `OAuthHelpers.completeAuthorization` because
  `@cloudflare/workers-oauth-provider@0.6.x`'s `createClient` always generates
  a fresh `clientId`, making it impossible to register a stable `ob-cli` ID
  for a synthetic auth-code exchange. The `resolveExternalToken` path lands
  at the same `ctx.props` and is simpler.

## Production wiring

| Binding | Provisioning |
| --- | --- |
| `AI` | Automatic for any account with Workers AI enabled. |
| `VECTORIZE` | `bunx wrangler vectorize create thoughts-v1 --dimensions=1024 --metric=cosine` (see ARCHITECTURE.md). |
| `OAUTH_KV` | `bunx wrangler kv namespace create OAUTH_KV`. |
| Secrets | `bunx wrangler secret put CLERK_JWKS_URL`, `CLERK_CLIENT_ID`, `CLERK_CLIENT_SECRET`, `INTERNAL_API_SECRET`, `DEVICE_FLOW_SECRET`. |

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

## Convex HTTP surface alignment

The MCP tool surface and `packages/convex/convex/http.ts` are now in lockstep.
Every parsed response in `src/deps/convex.ts` goes through a Zod schema in
`src/deps/convex-schemas.ts` — the raw `fetch` call is the only untyped
escape hatch. See `tests/deps/convex.test.ts` for the contract assertions
(request body shape + response parsing) per endpoint.
