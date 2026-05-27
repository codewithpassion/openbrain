# Deployment — OpenBrains end-to-end

Runbook for bringing up Convex + Cloudflare (Worker + KV + Vectorize +
Workers AI) + Clerk from a fresh account, ending with a working
`bun run smoke` against the deployed URLs and Claude Desktop connected
to your private brain.

Target time: ~60 minutes for someone comfortable with Cloudflare and
Clerk dashboards. Treat the commands below as copy-paste sources of
truth — this file is exercised by the smoke test workflow.

## 0. Prerequisites

- **Bun ≥ 1.3.0** — `curl -fsSL https://bun.sh/install | bash`.
- **Cloudflare account** with Workers AI enabled.
- **Convex account** (free tier is fine).
- **Clerk account** (free tier supports OAuth-as-IdP).
- `bunx wrangler whoami` resolves your Cloudflare account.

Clone and install:

```bash
git clone <your-fork>/openbrains
cd openbrains
bun install
bun run check    # must be green before deploying
```

## 1. Clerk — create the application

1. Sign in to <https://dashboard.clerk.com> and create an application.
   Enable **Email** + **Google** (or whatever sign-in methods you want).
2. In **API Keys**, copy:
   - `CLERK_PUBLISHABLE_KEY` (starts `pk_test_...`)
   - `CLERK_SECRET_KEY` (starts `sk_test_...`)
   - The Frontend API host (e.g. `your-tenant.clerk.accounts.dev`) →
     this is `CLERK_DOMAIN` and `CLERK_JWKS_URL` is
     `https://<CLERK_DOMAIN>/.well-known/jwks.json`.
3. **OAuth Applications → New** (Clerk-as-IdP). Create an OAuth
   application named "OpenBrains MCP" with:
   - Redirect URIs (add both):
     - `https://<your-mcp-worker>.workers.dev/callback`
     - `https://<your-dashboard>.workers.dev/sign-in/callback`
   - Scopes: `openid email profile`
   - Copy the resulting `CLERK_CLIENT_ID` + `CLERK_CLIENT_SECRET`.

You'll come back here once you know your final Worker hostnames if you
haven't reserved them yet.

## 2. Convex — create the deployment

```bash
cd packages/convex
bunx convex dev          # first run prompts you to create a project
```

This writes `.env.local` with `CONVEX_DEPLOYMENT=...` and prints your
`CONVEX_URL` (e.g. `https://your-deployment.convex.cloud`). Leave
`bunx convex dev` running in another terminal — it pushes schema and
function changes live as you edit.

Configure Convex to trust your Clerk JWKS — `convex/auth.config.ts`
already reads the domain from a deployment env var. Set it:

```bash
bunx convex env set CLERK_DOMAIN your-tenant.clerk.accounts.dev
```

Set the shared secret the MCP Worker uses to authenticate to
`convex/http.ts` (and that Convex actions use back the other way, to
call the Worker's `/internal/ai/run` for embeddings via Workers AI):

```bash
# Generate a 32-byte random value.
INTERNAL_API_SECRET=$(openssl rand -hex 32)
bunx convex env set INTERNAL_API_SECRET "$INTERNAL_API_SECRET"
# Save this — you'll set the same value on the Worker side in step 4.
echo "$INTERNAL_API_SECRET" > /tmp/ob-internal-api-secret
```

Once the MCP Worker is deployed (step 4) and the dashboard is deployed
(step 5), come back and set their URLs so Convex actions can reach
the two Workers AI bridges:

```bash
# MCP Worker hosts /internal/ai/run (embeddings) used by
# internal.aiAction.embedInternal + thoughtsAction.reembedInternal.
bunx convex env set MCP_WORKER_URL https://<your-mcp-worker>.workers.dev

# Dashboard worker hosts /internal/ai/chat (chat completions) used by
# entitiesAction, thoughtsAction (classify/enrich/split),
# digestsAction, briefingsAction.
bunx convex env set DASHBOARD_WORKER_URL https://<your-dashboard>.workers.dev
# No trailing slashes. Both bridges fall back to {status: "skipped"}
# when their URL is unset, so deployment ordering (Convex first, then
# the Workers, then setting these) is safe.
```

> OpenRouter as an LLM provider is no longer used by Convex actions —
> classification, enrichment, brain-dump split, entity extraction,
> digests, and briefings all call Workers AI through the dashboard
> worker. The MCP Worker still accepts an optional `OPENROUTER_API_KEY`
> secret as an override for *its* chat-LLM tools (step 4).

## 3. Cloudflare — provision resources

From the repo root:

```bash
# KV namespace for the OAuth provider's token storage.
bunx wrangler kv namespace create OAUTH_KV
# → copy the id into apps/mcp/wrangler.jsonc under kv_namespaces[0].id

# Vectorize index — 1024-dim Qwen3 embeddings, cosine.
bunx wrangler vectorize create openbrain-thoughts-v1 \
  --dimensions=1024 --metric=cosine

# Metadata indexes so MCP search can push down filters cheaply.
bunx wrangler vectorize create-metadata-index openbrain-thoughts-v1 \
  --property-name=type   --type=string
bunx wrangler vectorize create-metadata-index openbrain-thoughts-v1 \
  --property-name=source --type=string
```

The `AI` binding (Workers AI) is implicit — no provisioning needed if
your account has Workers AI enabled. You can sanity-check with
`bunx wrangler ai models list | head`.

## 4. MCP Worker — secrets + deploy

Fill `apps/mcp/wrangler.jsonc` so the `vars` block points at the
correct Convex URL and your KV id is in place, then set the secrets:

```bash
cd apps/mcp

# Public-ish env (kept in wrangler.jsonc vars):
#   CONVEX_URL, EMBEDDING_MODEL, CLERK_DOMAIN, CLERK_JWKS_URL

# Secrets:
bunx wrangler secret put CLERK_CLIENT_ID
bunx wrangler secret put CLERK_CLIENT_SECRET
bunx wrangler secret put INTERNAL_API_SECRET      # paste /tmp/ob-internal-api-secret
bunx wrangler secret put DEVICE_FLOW_SECRET       # `openssl rand -hex 32`
bunx wrangler secret put OPENROUTER_API_KEY       # optional — Workers AI is the default

bun --filter @openbrains/mcp deploy
```

Note the resulting `https://<worker>.workers.dev` URL — if it differs
from what you put into the Clerk OAuth redirect list in step 1, update
the redirect URI in Clerk now. Also go back to step 2 and run
`bunx convex env set MCP_WORKER_URL https://<worker>.workers.dev` so
Convex actions can reach `/internal/ai/run`.

## 5. Dashboard — deploy

```bash
cd apps/dashboard
# Put VITE_CONVEX_URL and VITE_CLERK_PUBLISHABLE_KEY into wrangler.jsonc vars.
bunx wrangler secret put CLERK_SECRET_KEY
bun --filter @openbrains/dashboard deploy
```

Add `https://<dashboard>.workers.dev/sign-in/callback` to the Clerk
OAuth redirect list if it wasn't already there.

## 6. CLI — install locally

The CLI ships as a Bun binary, not via npm in v1.

```bash
bun --filter @openbrains/cli build       # → apps/cli/dist/index.js
# Option A: bun link (works today)
cd apps/cli && bun link && cd ../..
bun link @openbrains/cli                 # in any shell that needs `ob`
# Option B: drop the dist file on PATH:
sudo install apps/cli/dist/index.js /usr/local/bin/ob
```

`bun install -g @openbrains/cli` is not supported yet — the CLI agent
flagged this as a follow-up; use `bun link` until then.

## 7. First-run check (the smoke test)

```bash
# 1. Authenticate against your fresh Worker.
ob login --server https://<your-mcp-worker>.workers.dev

# 2. Verify the bearer round-trips.
ob whoami        # prints your email
ob capture "hello from the deployment runbook"

# 3. The end-to-end smoke script.
OB_SERVER_URL=https://<your-mcp-worker>.workers.dev bun run smoke
```

`bun run smoke` captures 10 fixtures, queries each one back via
paraphrase, and asserts every top result scores above 0.5. Exit code
0 means the whole capture → embed → Vectorize → search round-trip is
healthy.

**Run against a fresh deployment for the first verification.** The
smoke script asserts the top search result equals the smoke fixture
exactly. If your real store already contains thoughts that paraphrase
the fixture queries closer than the fixtures themselves, you'll see
false failures. That's the smoke test surfacing real-store
interference — expected and correct, but a fresh deployment removes
the ambiguity.

For an offline rehearsal (no real infra), use the mock:

```bash
OB_SMOKE_MOCK=1 bun run smoke
```

The mock boots an in-process MCP server backed by a deterministic
token-overlap scorer — same Zod contracts, no Cloudflare bill.

## 8. Connect Claude Desktop

1. Open **Settings → Connectors → Add Custom Connector** in Claude
   Desktop.
2. Paste `https://<your-mcp-worker>.workers.dev/mcp` as the MCP URL.
3. Claude redirects to the Worker's `/authorize`, which redirects to
   Clerk's hosted sign-in.
4. After approving, Claude lists the OpenBrains tools — the v1 set
   (`capture_thought`, `search_thoughts`, `list_thoughts`,
   `thought_stats`, `search`, `fetch`, `memory_recall`,
   `memory_writeback`, `memory_review`) plus the Phase C/E additions
   (`list_entities`, `get_entity`, `entity_relations`,
   `classify_thought`, `enrich_thought`, `pan_brain_dump`).
5. Try a round-trip: ask Claude to "capture a thought: …" then "search
   for thoughts about …". Claude should call the tools and return your
   own data.

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| 401 on `/mcp` after some time | Device-flow bearer expired (no refresh tokens for those). Run `ob login` again. |
| 503 / 5xx on `capture_thought` | Vectorize metadata index missing — re-run `wrangler vectorize create-metadata-index` from step 3. |
| `ob login` hangs at `authorization_pending` | You haven't approved in the browser yet. Open the URL printed by the CLI. |
| Claude Desktop connector fails OAuth | Your redirect URI list in Clerk doesn't match the deployed Worker host. Edit it and try again. |
| `bun run smoke` env error | Either set `OB_SERVER_URL` + `OB_ACCESS_TOKEN`, or run `ob login` first (the script reads `~/.config/ob/credentials.json` as a fallback). |
| Search returns no results above threshold | The embedding pipeline silently failed — check Worker logs (`bunx wrangler tail`) for Workers AI 5xx, then confirm the Vectorize index is the `openbrain-thoughts-v1` 1024-dim cosine index from step 3. |
| Smoke fixtures pile up in your store | v1 has no `deleteThought` MCP tool. Fixtures are tagged `source=smoke` and easy to clean from the Convex dashboard. Tracked as a follow-up. |
| `classify_thought` / `enrich_thought` / `pan_brain_dump` always return the safe-default fallback | The Workers AI binding is missing or the chat model is throttled. Check `bunx wrangler tail` for 5xx from `@cf/meta/llama-3.1-8b-instruct`. Setting `OPENROUTER_API_KEY` switches the LLM to OpenRouter; the Workers AI splitter/extractor stay as the fallback. |
| `internal.aiAction.embedInternal` always returns `{status:"skipped"}` | `MCP_WORKER_URL` or `INTERNAL_API_SECRET` not set on the Convex deployment. Re-run `bunx convex env set MCP_WORKER_URL …` from step 2. |
| `entitiesAction.extractFromThoughtInternal`, `classifyOnCaptureInternal`, `enrichThoughtInternal`, `splitBrainDumpInternal`, `digestsAction.*`, or `briefingsAction.*` returns `{status:"skipped"}` | `DASHBOARD_WORKER_URL` or `INTERNAL_API_SECRET` not set on the Convex deployment. Re-run `bunx convex env set DASHBOARD_WORKER_URL …` from step 2. |

## 10. Rollback

There are no destructive schema migrations in v1. To take the system
down:

```bash
bunx wrangler delete ob-mcp                       # MCP Worker
bunx wrangler delete ob-dashboard                 # Dashboard Worker
bunx wrangler kv namespace delete --binding OAUTH_KV
bunx wrangler vectorize delete openbrain-thoughts-v1
# Convex: archive the deployment from the dashboard.
# Clerk: delete the application from the dashboard.
```
