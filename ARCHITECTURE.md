# OpenBrains — Architecture (v1)

A reimplementation of [Nate B. Jones's Open Brain (OB1)](https://github.com/NateBJones-Projects/OB1) on Cloudflare + Convex + Clerk, plus an MCP server for any AI client to plug in.

## Decisions locked

| Decision | Choice | Rationale / one-way door notes |
| --- | --- | --- |
| Tenancy | **Multi-tenant SaaS** | Every Convex query filters by `userId`. Clerk pays for itself. |
| v1 scope | **Core thoughts + dashboard + CLI capture + Agent Memory sidecars** | One vertical slice that proves the whole stack. |
| Embedding model | **`@cf/qwen/qwen3-embedding-0.6b`** (1024 dims, 4096 input tokens, Workers AI) | *Upgraded from bge-base-en-v1.5 (768d/512 tokens) — 512 tokens is too small for free-form thoughts. Qwen3 has 8x the context window for a 256-dim cost.* Dimensions are locked once the Vectorize index is created. |
| Vector store | **Cloudflare Vectorize** (vectors only) + **Convex** (text + metadata) | Vectorize at edge, Convex as source of truth. Two-system sync is the cost. |
| MCP server runtime | **Cloudflare Worker** with `@modelcontextprotocol/sdk` + `agents` (`createMcpHandler`) | CF has first-class remote MCP support. |
| MCP auth | **`@cloudflare/workers-oauth-provider`** delegating to **Clerk** (OAuth IdP) | Production-quality. No shared secrets. Per-user identity in MCP context. |
| Dashboard | **TanStack Start** (CF Workers template) + **shadcn/ui** | Official CF template; auto-detected by `wrangler deploy`. |
| Backend data layer | **Convex** | Reactive queries, mutations, scheduled jobs. Clerk integration built in. |
| Capture surfaces (v1) | Dashboard quick-capture + `ob` **CLI** | CLI doubles as a reference MCP client. |
| LLM gateway (metadata extraction) | **OpenRouter** initially (OB1 default), with a thin adapter so we can swap to Workers AI or Anthropic direct later | Adapter pattern; not a one-way door. |

## System diagram

```
┌────────────────────────────────────────────────────────────────┐
│  AI Clients (Claude Desktop, Codex, Cursor, ChatGPT connector) │
└─────────────────────────┬──────────────────────────────────────┘
                          │ MCP / Streamable HTTP, OAuth 2.1
                          ▼
┌────────────────────────────────────────────────────────────────┐
│  CF Worker: ob-mcp                                             │
│  - @cloudflare/workers-oauth-provider                          │
│      /authorize, /token, /register                             │
│  - Delegates auth UI to Clerk                                  │
│  - createMcpHandler (apiRoute: /mcp)                           │
│  - Tools: search_thoughts, list_thoughts, capture_thought,     │
│           thought_stats, search, fetch (ChatGPT compat),       │
│           memory_recall, memory_writeback                      │
│  - Bindings: AI (Workers AI), VECTORIZE, CONVEX_URL,           │
│              CLERK_JWKS_URL, OAUTH_KV (token storage)          │
└─────────┬──────────────────────────────────────────┬───────────┘
          │ Convex HTTP client (with userId from JWT)│ Vectorize binding
          ▼                                          ▼
┌──────────────────────────────┐         ┌────────────────────────┐
│  Convex (data layer)         │         │  CF Vectorize          │
│  - thoughts                  │         │  Index: thoughts-v1    │
│  - thought_metadata          │         │  dims=1024, cosine     │
│  - memory_provenance         │         │  namespace = userId    │
│  - memory_review             │         │  metadata indexes:     │
│  - memory_use_policy         │         │   type, topic, source  │
│  - memory_source_refs        │         │  payload: {thoughtId,  │
│  - memory_recall_traces      │         │   userId}              │
│  - memory_audit              │         └────────────────────────┘
│  - api_keys (for CLI tokens) │
│  Clerk JWT verification      │
└──────────────────────────────┘
          ▲                  ▲
          │ reactive queries │ HTTP from Worker
          │                  │
┌──────────────────────────┐ │
│  CF Worker: ob-dashboard │ │
│  TanStack Start + shadcn │─┘
│  - Clerk middleware      │
│  - Quick capture, search │
│  - Memory inspector      │
│  - API key minting       │
└──────────────────────────┘
          ▲
          │
┌──────────────────────────┐
│  CLI: `ob`               │
│  - `ob capture "..."`    │
│  - `ob search "..."`     │
│  - `ob recall "..."`     │
│  Auth: OAuth device flow │
│  via the MCP Worker      │
└──────────────────────────┘
```

## Data model

### Core: `thoughts` (Convex)

```ts
// convex/schema.ts
defineTable({
  userId: v.string(),              // Clerk userId — every query filters by this
  content: v.string(),
  source: v.string(),              // "dashboard" | "cli" | "mcp" | "import:obsidian" | ...
  vectorizeId: v.optional(v.string()), // foreign key into Vectorize
  embeddingModel: v.string(),      // "@cf/qwen/qwen3-embedding-0.6b" — track for migrations
  embeddingDims: v.number(),
  fingerprint: v.string(),         // SHA-256 of normalized content, for dedup (OB1 primitive)
  metadata: v.object({
    type: v.optional(v.string()),  // "observation" | "task" | "idea" | "reference" | "person_note"
    topics: v.array(v.string()),
    people: v.array(v.string()),
    action_items: v.array(v.string()),
    dates_mentioned: v.array(v.string()),
  }),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_created", ["userId", "createdAt"])
  .index("by_user_fingerprint", ["userId", "fingerprint"]);  // dedup
```

### Sidecars: Agent Memory (OB1 schemas/agent-memory)

Modeled after OB1's `agent-memory` schema sidecars. Each row references a `thoughtId`.

```ts
// memory_provenance
{
  thoughtId, userId,
  origin: "human" | "agent_inferred" | "agent_generated" | "import",
  agent: v.optional(v.string()),
  agentVersion: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  capturedAt: v.number(),
}

// memory_review (trust grading)
{
  thoughtId, userId,
  status: "unreviewed" | "confirmed" | "rejected" | "needs_revision",
  reviewer: v.string(),
  reviewedAt: v.number(),
  note: v.optional(v.string()),
}

// memory_use_policy (per OB1 guardrail: inferred = evidence; instruction-grade requires human confirmation)
{
  thoughtId, userId,
  trustGrade: "instruction" | "evidence" | "draft",
  scopes: v.array(v.string()),  // ["personal", "shared:work"]
  expiresAt: v.optional(v.number()),
}

// memory_source_refs (where did this come from? URL, file, message, etc.)
{ thoughtId, userId, kind: v.string(), uri: v.string(), excerpt: v.optional(v.string()) }

// memory_recall_traces (audit: what queries returned this thought?)
{ thoughtId, userId, query: v.string(), score: v.number(), clientId: v.string(), at: v.number() }

// memory_audit (immutable log of mutations)
{ thoughtId, userId, action: v.string(), actor: v.string(), at: v.number(), diff: v.any() }
```

OB1 guardrail to mirror in code: **inferred/generated memory defaults to `evidence`; `instruction`-grade requires explicit human confirmation.**

### `api_keys` (CLI device-flow + future programmatic access)

```ts
defineTable({
  userId: v.string(),
  hash: v.string(),                // never store the raw key
  name: v.string(),                // user-visible label
  scopes: v.array(v.string()),     // ["capture", "search", "memory:write"]
  lastUsedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_hash", ["hash"]);
```

### Vectorize index

```bash
npx wrangler vectorize create thoughts-v1 --dimensions=1024 --metric=cosine
npx wrangler vectorize create-metadata-index thoughts-v1 --property-name=type --type=string
npx wrangler vectorize create-metadata-index thoughts-v1 --property-name=source --type=string
# topics use array filtering via namespace + multiple inserts, or denormalize one row per topic
```

- **Namespace = `userId`** (built-in Vectorize filter, free). This is our primary tenant isolation.
- **Vector id = `thoughtId`** (the Convex document id). One-to-one.
- **Payload metadata** kept tiny: `{ type, source }`. Anything else lives in Convex; we filter coarsely in Vectorize then look up.

## MCP tools (v1)

Mirroring OB1's surface so existing OB1 clients/skills work with minimal changes:

| Tool | Read-only | Notes |
| --- | --- | --- |
| `search` | ✅ | ChatGPT/connector compatibility shape — returns `[{id, title, url}]` |
| `fetch` | ✅ | ChatGPT/connector compatibility — full thought by id |
| `search_thoughts` | ✅ | Rich semantic search with threshold/limit/filters |
| `list_thoughts` | ✅ | Recent, with type/topic/person/days filters |
| `thought_stats` | ✅ | Counts, types, top topics, people |
| `capture_thought` | ❌ | Embed → upsert to Convex → upsert to Vectorize → extract metadata async |
| **`memory_recall`** | ✅ | Returns thoughts **with provenance + trust grade**, sorted by trust-weighted score |
| **`memory_writeback`** | ❌ | Stores agent-inferred memory at `evidence` grade by default |
| **`memory_review`** | ❌ | Lets a human (or another agent acting on user's behalf) promote evidence → instruction |

The last three are the Agent Memory sidecar surface. They're what makes this version meaningfully better than OB1 for coding-agent use cases (where you want governed recall and write-back, not raw RAG).

## Auth flow

### Dashboard (Clerk, classic)
1. User hits dashboard → Clerk middleware → signed-in session.
2. Convex client signs in with the Clerk JWT (`ConvexProviderWithClerk`).
3. Every Convex query/mutation has `ctx.auth.getUserIdentity()` returning the Clerk userId.

### MCP (OAuth 2.1, via CF Workers OAuth Provider)
1. AI client connects to `https://ob-mcp.openbrains.dev/mcp`.
2. Server returns 401 + WWW-Authenticate pointing at `/authorize`.
3. Client follows dynamic client registration (`/register`) then `/authorize`.
4. `/authorize` (our `defaultHandler`) redirects user to **Clerk's hosted sign-in page**.
5. Clerk redirects back; we mint an OAuth access token, store in `OAUTH_KV` keyed to the Clerk userId.
6. Client uses bearer token; the Worker's `apiHandler` resolves token → userId → forwards to Convex.

### CLI (OAuth device flow)
1. `ob login` opens browser to `/authorize?response_type=device_code...`.
2. User signs in via Clerk, approves CLI.
3. CLI polls `/token`, gets bearer, writes to `~/.config/ob/credentials.json`.
4. From then on, `ob capture "..."` posts to `/mcp` with that bearer.

## Repo layout

```
openbrains/
├── ARCHITECTURE.md                # this doc
├── README.md
├── pnpm-workspace.yaml
├── apps/
│   ├── dashboard/                 # TanStack Start + shadcn, CF Workers
│   │   ├── wrangler.jsonc
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   ├── components/        # shadcn primitives
│   │   │   └── lib/clerk.ts
│   │   └── package.json
│   ├── mcp/                       # CF Worker hosting MCP + OAuth
│   │   ├── wrangler.jsonc
│   │   ├── src/
│   │   │   ├── index.ts           # OAuthProvider entry
│   │   │   ├── auth/clerk.ts      # delegated handler
│   │   │   ├── mcp/server.ts      # createMcpHandler + tools
│   │   │   ├── tools/             # one file per tool
│   │   │   ├── embeddings.ts      # Workers AI binding wrapper
│   │   │   └── convex.ts          # Convex HTTP client wrapper
│   │   └── package.json
│   └── cli/                       # `ob` CLI (Node, distributed via npm)
│       ├── src/
│       │   ├── commands/
│       │   ├── auth.ts            # device flow
│       │   └── mcp-client.ts      # uses @modelcontextprotocol/sdk client
│       └── package.json
├── packages/
│   ├── convex/                    # Convex deployment (schema + functions)
│   │   ├── schema.ts
│   │   ├── thoughts.ts            # mutations/queries
│   │   ├── memory/                # provenance, review, use_policy, etc.
│   │   ├── apiKeys.ts
│   │   └── http.ts                # HTTP actions called by the MCP Worker
│   ├── shared/                    # shared types & zod schemas (tool contracts)
│   └── ingest/                    # embed + metadata extraction (used by Worker, CLI, dashboard)
└── docs/
    ├── ob1-mapping.md             # which OB1 concept maps to what
    └── setup.md                   # 30-min setup like OB1's 01-getting-started
```

## Build order (Phase 1, ~MVP)

1. **Convex schema + thoughts CRUD** (no UI yet). Verify with `convex run`.
   - *Done when:* can insert a thought via Convex CLI and query it back filtered by userId.
2. **Vectorize index + embed pipeline.** Wrapper module that takes `(content, userId, thoughtId)` and writes both. Bidirectional: delete in Convex → delete in Vectorize.
   - *Done when:* a smoke test embeds 10 thoughts, queries one back at >0.5 similarity.
3. **MCP Worker, no auth yet.** Hardcode a userId. Implement `search_thoughts`, `capture_thought`. Test with MCP Inspector locally.
   - *Done when:* MCP Inspector can list tools and round-trip capture+search.
4. **Add OAuth + Clerk delegation.** Workers OAuth Provider + Clerk hosted sign-in. Verify with MCP Inspector OAuth flow.
   - *Done when:* MCP Inspector completes OAuth, calls tools as authenticated user, Convex sees correct userId.
5. **Remaining tools:** `list_thoughts`, `thought_stats`, `search`/`fetch` compat shims.
6. **Agent Memory sidecars:** schemas + `memory_recall` / `memory_writeback` / `memory_review`. Enforce trust-grade defaults.
7. **TanStack Start dashboard:** sign-in (Clerk), quick-capture, recent thoughts feed, search box, API key management.
8. **CLI:** `ob login`, `ob capture`, `ob search`, `ob recall`. Distributed via npm.
9. **Connect Claude Desktop end-to-end:** add custom connector pointing at MCP URL, OAuth dance, capture+recall a real thought.

## Open questions to revisit after Phase 1

- **Capture integrations beyond CLI/dashboard.** Slack, Discord, Telegram, email. Each is a webhook → Convex HTTP action.
- **Importers (OB1 recipes).** ChatGPT export, Obsidian vault, Gmail, X/Twitter. These will run as long-lived Convex actions or scheduled jobs.
- **Embedding migration path.** If we change models, we need a re-embed job. Track `embeddingModel` + `embeddingDims` per-row so we can run mixed-model queries during a migration.
- **Multi-modal.** OB1 is text-only. Vectorize+Workers AI support image embeddings (e.g. `@cf/baai/bge-m3` or CLIP variants) — defer unless needed.
- **Shared brains / RLS-like sharing.** OB1's Extension 3+ uses Postgres RLS to share parts of a brain. With Convex this is per-row userId checks + a `shared_with` table. Defer until a real use case.
- **OB1 import.** Their `thoughts` table uses 1536-d OpenAI embeddings. To import OB1 data we'd need a re-embed (1536→1024) pass. Doable; not v1.

## Non-goals (v1)

- No Slack/Discord/Telegram capture. CLI + dashboard only.
- No importers. Empty brain on first run.
- No vector reranking. Plain k-NN with metadata filters.
- No team/org features. Multi-tenant means many isolated single-user brains, not shared workspaces.
- No mobile app. Mobile happens through Claude Desktop / ChatGPT app / Telegram later.

## Reference: stack versions (as of 2026-05-18)

- Workers AI: `@cf/qwen/qwen3-embedding-0.6b` (1024d, 4096 tokens, cosine)
- Vectorize: V2 (≥ 10M vectors/index, ≤ 1536 dims at 32-bit, ≤ 50 topK with values)
- `@cloudflare/workers-oauth-provider` + `agents` (`createMcpHandler`)
- `@modelcontextprotocol/sdk` (server in Worker, client in CLI)
- TanStack Start via `npm create cloudflare@latest -- --framework=tanstack-start`
- Convex (latest) with `ConvexProviderWithClerk`
- Clerk (latest) — Clerk supports OAuth as IdP for arbitrary downstream clients (verify exact config when building Phase 1, step 4)
