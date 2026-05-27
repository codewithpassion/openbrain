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
| LLM gateway (metadata extraction, classify/enrich/pan tools) | **Workers AI** (`@cf/meta/llama-3.1-8b-instruct`) is the MCP Worker default; `OPENROUTER_API_KEY` is an optional override that falls back to Workers AI on failure. Convex actions (digests, entity extraction) still default to OpenRouter — they don't share the binding. | Adapter interface (`MetadataExtractor`, `BrainDumpSplitter`) makes swapping costless. |
| Convex → Workers AI bridge | `POST /internal/ai/run` on the MCP Worker, protected by `INTERNAL_API_SECRET`. Convex actions use `createWorkersAiHttpClient` to call it. | Convex doesn't have an `AI` binding; this is the only path. Gated on `MCP_WORKER_URL`. |

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
│  - v1 tools: search_thoughts, list_thoughts, capture_thought,  │
│           thought_stats, search, fetch (ChatGPT compat),       │
│           memory_recall, memory_writeback, memory_review       │
│  - Phase C/E tools: list_entities, get_entity,                 │
│           entity_relations, classify_thought, enrich_thought,  │
│           pan_brain_dump                                       │
│  - /internal/ai/run — Convex → Workers AI bridge               │
│      (shared INTERNAL_API_SECRET)                              │
│  - Bindings: AI (Workers AI), VECTORIZE, CONVEX_URL,           │
│              CLERK_JWKS_URL, OAUTH_KV (token storage)          │
└─────────┬──────────────────────────────────────────┬───────────┘
          │ Convex HTTP client (with userId from JWT)│ Vectorize binding
          │   ▲ /internal/ai/run for embeddings      │
          ▼   │                                      ▼
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
│  - entities, entity_mentions,│
│    entity_relations (Phase C)│
│  - api_keys (for CLI tokens) │
│  - aiAction.embedInternal    │
│    (calls Worker /internal)  │
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

## MCP tools

Mirroring OB1's surface so existing OB1 clients/skills work with minimal changes. v1 is the OB1-equivalent set; Phase C/E additions land entity navigation + LLM workflow primitives.

### v1 (capture / search / governed memory)

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

### Phase C — entity navigation

| Tool | Read-only | Notes |
| --- | --- | --- |
| `list_entities` | ✅ | Lists entities for the authenticated user; optional `kind` filter (person / org / topic / …) |
| `get_entity` | ✅ | One entity by id plus recent mentions |
| `entity_relations` | ✅ | Outgoing and incoming typed relations for an entity |

### Phase E — LLM workflow primitives (read-only, no persistence)

All three accept an injected `MetadataExtractor` / `BrainDumpSplitter` (Workers AI by default, OpenRouter override). The tools surface LLM output — they don't mutate the thought; callers can pipe results into `capture_thought` or a future `update_thought`.

| Tool | Read-only | Notes |
| --- | --- | --- |
| `classify_thought` | ✅ | Returns the LLM-inferred `metadata.type` for a thought |
| `enrich_thought` | ✅ | Returns full LLM-inferred `ThoughtMetadata` (type, topics, people, action items, dates) |
| `pan_brain_dump` | ✅ | Splits a freeform dump into up to `maxIdeas` discrete idea candidates |

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

## Non-goals (Phase 1 v1 only)

These were deferred from v1 to keep the first vertical slice small. Most are now scheduled in **Post-v1 roadmap** below; the ones still off-limits are flagged "(deferred indefinitely)".

- Slack/Discord/Telegram capture — scheduled (after Gmail). Email/Slack **delivery** of digests is also deferred.
- Importers — scheduled (Phase D ships Gmail backup/restore as the reference).
- Vector reranking — (deferred indefinitely)
- Team/org features / shared brains — (deferred indefinitely; per-user only)
- Mobile app — (deferred indefinitely; mobile via Claude Desktop / ChatGPT app)
- Multi-modal — (deferred indefinitely)

## Carried-over open questions

- **Embedding migration path.** If we change models, we need a re-embed job. Track `embeddingModel` + `embeddingDims` per-row so we can run mixed-model queries during a migration. (Phase B introduces the re-embed pipeline; full migration job comes later.)
- **OB1 data import.** Their `thoughts` table uses 1536-d OpenAI embeddings. To import OB1 data we'd need a re-embed (1536→1024) pass. (Folded into Phase D.)

## Post-v1 roadmap

Driven by gap-analysis vs OB1. Each phase is gated on `bun run check` green and updates this section as work completes. Phases are ordered by **architectural risk and dependency**, not user enthusiasm — earlier phases unblock later ones.

### Phase A — Surface what already exists (dashboard wiring + skill-pack convention)

**No new tables. No new infra.** Wires up dashboard pages that read sidecar tables already populated by the MCP/CLI surface.

Adds:

- `apps/dashboard/src/routes/thoughts.$id.tsx` — thought detail: content, source refs, provenance, use policy, review history, delete (edit deferred to Phase B's re-embed pipeline).
- `apps/dashboard/src/routes/inspector.tsx` — Memory Inspector: list `memory_review` entries, promote evidence → instruction via `memory.review.promote`.
- `apps/dashboard/src/routes/audit.tsx` — Audit log viewer over `memory_audit`.
- `packages/skills/` — manifest convention (`skill.json` + `prompt.md`) for OB1-style skill packs. Phase A ships **3** packs (`research-synthesis`, `meeting-synthesis`, `panning-for-gold`); remaining 13 are populated opportunistically.
- New Convex query: `memory.review.listForUser({status?, limit})`.

**Deferred to later phases**: duplicate review (needs vector-similarity scan, not pure fingerprint lookup — Phase E).

### Phase B — Scheduled-job primitive + daily digest (stored locally)

Introduces Convex scheduled actions. Daily digest is the smallest reference implementation; `life-engine`, `thought-enrichment`, `entity-extraction` all reuse this primitive.

Adds:

- Convex `digests` table: `{ userId, date, summary, thoughtIds[], generatedAt }`.
- `digests.generateForUser` internal action — summarizes last 24h via the existing OpenRouter metadata-extraction adapter.
- Convex cron: once-daily per user.
- `apps/dashboard/src/routes/digests.tsx` — list digests, "regenerate now" button.
- `apps/dashboard/src/routes/jobs.tsx` — Scheduled-jobs status page.
- Re-embed pipeline for `thoughts.updateContent` (re-fingerprint, re-embed, re-extract metadata). Unblocks Phase A's deferred edit.
- **Email/Slack delivery: not in this phase.** Digests are local-only.

### Phase C — Entity model (entities + extraction + wiki + graph + typed edges)

Biggest architectural commitment. Adds entity-centric data alongside thought-centric data.

**Decision (resolved 2026-05-19)**: extraction runs as a **Convex internal action** (`entitiesAction.extractFromThoughtInternal`), not a separate CF Worker. Rationale: Phase B established the scheduled-action pattern; entity extraction is bursty (only on capture or backfill), so a long-running Worker is overkill; tenant-scoping is automatic via Convex `userId` filters. If we ever need independent scaling, the action can be moved to a Worker behind the same internal-mutation API.

Adds:

- Convex tables:
  - `entities` — `{ userId, kind: "person"|"org"|"topic"|..., canonicalName, aliases[], metadata }`
  - `entity_mentions` — `{ entityId, thoughtId, span?: {start, end} }`
  - `entity_relations` — `{ fromEntityId, toEntityId, kind, evidenceThoughtIds[], confidence }`
- Entity extraction action: NER + canonicalization, runs on capture + on backfill.
- Typed-edge classifier: LLM picks `relation.kind` given two entities + evidence thoughts.
- Dashboard routes: `/entities`, `/entities/$id` (synthesized wiki page), `/graph` (ob-graph viz — force-directed canvas via `react-force-graph-2d`, driven by `buildGraphModel`).
- MCP tools: `list_entities`, `get_entity`, `entity_relations` — **landed**, see "MCP tools › Phase C".
- Convex query `entities.relationsForUser({limit?})` backs the all-relations fetch for the graph canvas.

### Phase D — Importer/exporter pattern (Gmail backup + restore as reference)

Establishes the long-running-action shape and the ingestion dashboard surface. Gmail backup AND restore are the reference implementation — every later importer (Obsidian, ChatGPT, etc.) reuses the same `Importer` interface.

Adds:

- `packages/ingest/src/sources/` — `Importer` interface (`begin`, `nextBatch`, `finalize`).
- Convex `imports` table: `{ userId, source, status, cursor, stats, createdAt }`.
- Gmail importer: incremental cursor by `historyId`; OAuth via Clerk Google connection or a separate stored token (decision at start of phase).
- Gmail exporter: dumps thoughts to a Gmail label *or* an mbox archive in R2 (decision at start of phase).
- Brain backup/restore: bundle thoughts + sidecars to JSON in R2; restore reverses the bundle.
- `apps/dashboard/src/routes/ingest.tsx` — list sources, start/pause, last-run stats.

### Phase E — LLM workflow primitives (adaptive capture, thought enrichment, panning for gold, quality auditing)

Workflows that operate **on** existing thoughts. All reuse Phase B's scheduled-action primitive and Phase C's entity model.

Adds:

- `adaptive-capture-classification`: on capture, LLM fills `metadata.type` if not supplied. **Landed**: `thoughtsAction.classifyOnCaptureInternal` is scheduled by `createThought` / `createThoughtInternal` whenever `metadata.type` is unset. Persists via `thoughts.setTypeInternal`.
- `thought-enrichment`: scheduled action refines metadata/entities for under-tagged thoughts. **Landed**: `thoughtsAction.enrichThoughtInternal` + `thoughts.mergeMetadataInternal` (union for arrays, fill-only for `type` — never overwrites existing).
- `panning-for-gold`: takes a brain-dump thought, splits into N evaluated idea thoughts. **Landed**: `thoughtsAction.splitBrainDumpInternal` + `thoughts.persistSplitInternal`. Children carry `parentThoughtId` (new schema field, `by_user_parent` index) and are idempotent on `(parentThoughtId, content)` via a derived fingerprint.
- **Duplicate review** (deferred from Phase A): vector-similarity scan to surface near-duplicates. **Primitive landed** as `services/related-thoughts.ts` + MCP tool `related_thoughts`. **UI deferred**: `/inspector?tab=duplicates` needs a Convex→Worker Vectorize bridge.
- Quality auditing: flags thoughts with missing fields, low embedding norm, no entities — surfaces in `/inspector`. **Landed** (`convex/quality.ts`, `/quality` route).
- MCP tools: `classify_thought`, `enrich_thought`, `pan_brain_dump` — read-only LLM proxies. `related_thoughts` added in this phase for duplicate review.
- Skill packs: all 16 OB1 packs shipped (Phase A established the convention; remaining packs filled opportunistically).

### Phase F — Professional CRM (depends on Phase C entity model)

Domain extension. CRM = entities of `kind: "person"` + `kind: "org"` with extra structured fields, plus interactions tagged as meetings/calls/emails.

Adds:

- Entity schema extensions: `person` gains `{title, company: entityRef, email, phone, last_contact_at, notes}`; `org` gains `{industry, hq, headcount_estimate, notes}`. **Landed**: discriminated-union Zod schema in `packages/shared/src/entities.ts` (`personEntityMetadataSchema`, `orgEntityMetadataSchema`). Convex validator stays `v.any()` (per the CLAUDE.md pattern); `crm.updateEntityMetadata` narrows at the boundary and rejects cross-kind writes.
- New table `interactions` — `{ personId, thoughtId, kind, at }`. **Landed**.
- Routes `/crm`, `/crm/$personId`, `/crm/$orgId`. **All landed**.
- Skill pack: `relationship-development`. **Landed**.

### Phase H — Project scope (one brain, many namespaces) — **landed (Convex + MCP)**

Adds an optional `scope` namespace so a user with one connected brain can target a specific project (e.g. `work`, `side-project-x`). Unscoped thoughts remain visible everywhere — they are "personal/global" memory.

Landed:

- Convex `projects` table — `{ userId, slug, name, description?, createdAt }`, `(userId, slug)` unique. CRUD: `projects.create/list/getBySlug` plus `createInternal`/`listInternal`/`getBySlugInternal`.
- `thoughts.scope?: v.optional(v.string())` with two new indexes: `by_user_scope_created` (filtered list) and `by_user_scope_fingerprint` (dedup is per-`(user, scope, fingerprint)` — the same idea can exist in two projects independently).
- Validation: writing a `scope` requires the slug to exist for that user (throws `PROJECT_NOT_FOUND`) — typo protection.
- Threaded through: `createThought`, `createThoughtInternal`, `listThoughts`, `listThoughtsInternal`, `getByFingerprint`, `getByFingerprintInternal`, `updateContent` collision check, `persistSplit` (children inherit parent scope).
- HTTP boundary: `/api/projects` (POST = create), `/api/projects/list` (POST). Capture/list/by-fingerprint endpoints accept optional `scope`.
- Shared Zod: branded `ProjectId`/`ProjectSlug`, `projectSchema`, `createProject`/`listProjects` tool I/O schemas. Existing tool inputs (`capture_thought`, `list_thoughts`, `search_thoughts`, `memory_recall`) gained `scope?: ProjectSlug`.
- Services: `listProjects`, `createProject`. `searchThoughts` + `memoryRecall` over-fetch from Vectorize then post-filter by `scope` against the Convex row (Convex is the source of truth for scope).
- MCP tools: `list_projects`, `create_project`.

**Landed (follow-ups)**:

- Vectorize scope filter push-down: `searchThoughts`/`memoryRecall` thread `scope` into the Vectorize `query.metadata.filter` **when the operator opts in** via `SCOPE_INDEX_READY=1` on the MCP + dashboard Workers (`ServiceDeps.featureFlags.scopeIndexReady`). Otherwise they over-fetch (`topK = min(100, limit*4)`) and post-filter via Convex — safe with or without the metadata index. The Convex-row check is always enforced as the correctness gate. One-time operator step: `wrangler vectorize create-metadata-index thoughts-v1 --property-name=scope --type=string`, then flip the flag.
- CLI `ob project create/list/use` + per-command `--scope=<slug>` / `--no-scope` flags + active-project pin in `~/.config/ob/credentials.json` (under `activeProject`).
- Per-user session-scope default via OAUTH_KV (`session-scope:<userId>` keyspace). Two new MCP tools `set_session_scope` / `get_session_scope`. Capture/list/search/recall/memory_recall handlers default to the pinned scope when input doesn't carry one. Tool-supplied `scope` always wins.
- Dashboard project switcher in the header chrome backed by `useActiveScope` (`localStorage` `OB_ACTIVE_SCOPE`). Quick-capture / `/thoughts` / `/search` pass the pin through. Switcher hides while `api.projects.list` is loading.

**Still deferred**:

- Path-segment scoped routes (`crm.$scope.$personId.tsx`, etc.) — the current dashboard uses a global pin instead of literal route segments; entity-scoped CRM filtering needs an entity-side `scope` decision first.
- Per-token (rather than per-user) session-scope isolation in the MCP Worker, so two AI clients on the same user can have independent defaults. Needs a stable per-grant identifier surfaced into `AuthContext`.
- `memory_use_policy.scopes` (array) is preserved as the trust-grade-per-scope sidecar. That's a different semantic from `thoughts.scope` (the project namespace) and is intentionally not lifted.

### Phase G — Life engine

OB1's flagship "self-improving personal assistant." Scope doc lives at [`docs/phase-g-scope.md`](docs/phase-g-scope.md). Daily briefing loop: action reads recent thoughts + entities + the user's "world model" instruction-grade thought, produces a `briefings` row **and** a paired `thoughts` row with `metadata.type === "briefing"`.

Landed:

- `briefingsAction.generateForUserInternal` — best-effort, env-gated, mirrors `digestsAction`.
- `briefings.recordInternal` now writes a paired briefing-thought (idempotent on `(userId, date)`).
- `briefingsCron.fanOutDailyBriefings` — daily fan-out 30 min after digests.
- `briefings.worldModelForInternal` consumes the user's instruction-grade world-model thought as standing context.
- `briefingsAction.regenerateForMe` — public "regenerate now" action.

Depends on Phases B, C, E.

---

### Roadmap rules (apply across all phases)

1. **TDD discipline does not relax.** Every new Convex function, dashboard component, ingest module — failing test in the same diff.
2. **`bun run check` green per phase boundary**, not per merge. Phases are large; intra-phase tasks may break the gate; the phase itself does not.
3. **Skill packs are content, not features.** Don't treat "16 skill packs" as 16 engineering tasks. It's one convention (Phase A) plus N markdown files (filled opportunistically through Phase E).
4. **Decisions surface upward.** Each phase has a small number of open decisions (extraction worker placement, Gmail OAuth strategy, export format). Flag them at phase start, don't decide silently.
5. **OB1 mapping.** Every phase references the OB1 recipe/integration/extension it mirrors; the running cross-reference lives in `docs/ob1-mapping.md` (introduced during Phase A).

## Reference: stack versions (as of 2026-05-18)

- Workers AI: `@cf/qwen/qwen3-embedding-0.6b` (1024d, 4096 tokens, cosine)
- Vectorize: V2 (≥ 10M vectors/index, ≤ 1536 dims at 32-bit, ≤ 50 topK with values)
- `@cloudflare/workers-oauth-provider` + `agents` (`createMcpHandler`)
- `@modelcontextprotocol/sdk` (server in Worker, client in CLI)
- TanStack Start via `npm create cloudflare@latest -- --framework=tanstack-start`
- Convex (latest) with `ConvexProviderWithClerk`
- Clerk (latest) — Clerk supports OAuth as IdP for arbitrary downstream clients (verify exact config when building Phase 1, step 4)
