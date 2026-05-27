# Gap analysis — Phase A → G

**Update (2026-05-19, post-merge):** Most gaps closed in the follow-up pass —
see ["Resolved gaps" below](#resolved-gaps-2026-05-19). The original audit is
preserved unchanged so reviewers can see what shipped.

Snapshot of what's actually landed on `main` against the phase specs in
`ARCHITECTURE.md`. Audited 2026-05-19 against commit `93740f7` (the Phase
A–F merge). Status legend:

- **✅ complete** — every bullet in the spec ships in code and is covered by `bun run check`.
- **⚠️ framework-only** — the abstractions and surface area exist; the *reference integration* called out in the spec is missing.
- **❌ not started** — no code on the path described in the spec.

Each phase entry lists what's done, what's missing, and the smallest
follow-up that would close the gap.

---

## Phase A — Surface what already exists ✅

Spec: dashboard wiring + skill-pack convention. **No new tables.**

| Spec item | Status | Evidence |
| --- | --- | --- |
| `apps/dashboard/src/routes/thoughts.$id.tsx` | ✅ | committed |
| `apps/dashboard/src/routes/inspector.tsx` | ✅ | committed |
| `apps/dashboard/src/routes/audit.tsx` | ✅ | committed |
| `packages/skills/` manifest convention | ✅ | `skill.json` + `prompt.md` shape |
| 3 reference skill packs | ✅ | actually 16/16 OB1 packs shipped, well ahead of spec |
| `memory.review.listForUser({status?, limit})` | ✅ | `packages/convex/convex/memory/review.ts` |

**Deferred per spec**: duplicate review (moved to Phase E — see below; still unimplemented).

---

## Phase B — Scheduled-job primitive + daily digest ✅

| Spec item | Status | Evidence |
| --- | --- | --- |
| Convex `digests` table | ✅ | `schema.ts` |
| `digests.generateForUser` internal action | ✅ | `digestsAction.ts` |
| Convex cron (once-daily per user) | ✅ | `digestsCron.ts`, `crons.ts` |
| `apps/dashboard/src/routes/digests.tsx` | ✅ | committed |
| `apps/dashboard/src/routes/jobs.tsx` | ✅ | + `job_runs` table |
| Re-embed pipeline for `thoughts.updateContent` | ✅ | `thoughts.ts:119` (`updateContent` mutation re-fingerprints + re-embeds) |
| Email/Slack delivery | (intentionally deferred per spec) | not in Phase B |

---

## Phase C — Entity model ✅

| Spec item | Status | Evidence |
| --- | --- | --- |
| `entities` / `entity_mentions` / `entity_relations` tables | ✅ | `schema.ts` |
| Entity extraction action | ✅ | `entitiesAction.extractFromThoughtInternal` |
| Typed-edge classifier | ✅ | Workers AI entity adapter returns relations with `kind` + confidence |
| Dashboard `/entities` (list) | ✅ | committed |
| Dashboard `/entities/$id` (wiki page) | ✅ | committed |
| Dashboard `/graph` (ob-graph viz) | ✅ | `react-force-graph-2d` canvas, `buildGraphModel` |
| MCP tools `list_entities`, `get_entity`, `entity_relations` | ✅ | landed in the Phase C/E merge |

---

## Phase D — Importer/exporter pattern ⚠️ framework-only

| Spec item | Status | Evidence |
| --- | --- | --- |
| `packages/ingest/src/sources/` Importer interface | ✅ | `types.ts` defines `Importer` with `begin/nextBatch/finalize` |
| Convex `imports` table | ✅ | `schema.ts` |
| `bundle.ts` JSON brain backup helper | ✅ | `sources/bundle.ts` |
| `convex/brainBackup.ts` (backup + restore) | ✅ | committed |
| `apps/dashboard/src/routes/ingest.tsx` | ✅ | sources list + last-run stats |
| **Gmail importer** | ❌ | no `packages/ingest/src/sources/gmail.ts`. Spec calls this out as the reference implementation. |
| **Gmail exporter** (label or mbox to R2) | ❌ | same — bundle handles JSON-to-R2, but no Gmail-specific path |
| **OB1 data import** (1536d → 1024d re-embed pass) | ❌ | folded into Phase D per ARCHITECTURE; not started |

**Smallest follow-up**: implement `packages/ingest/src/sources/gmail.ts` as the reference `Importer`. Phase D's design intent was that one real source proves the framework — without it, the framework is unvalidated.

---

## Phase E — LLM workflow primitives ⚠️ framework-only

| Spec item | Status | Evidence |
| --- | --- | --- |
| MCP tools `classify_thought`, `enrich_thought`, `pan_brain_dump` | ✅ | read-only LLM proxies |
| Quality auditing surface | ✅ | `convex/quality.ts` + `apps/dashboard/src/routes/quality.tsx` |
| Skill packs (13 remaining OB1 packs) | ✅ | 16/16 in `packages/skills/skills/` |
| **`adaptive-capture-classification` scheduled action** | ❌ | the MCP tool surfaces LLM output; no Convex action persists `metadata.type` on capture |
| **`thought-enrichment` scheduled action** | ❌ | same — no scheduled action refines under-tagged thoughts |
| **`panning-for-gold` persistence** | ❌ | the tool returns ideas; no `splitInternal` action stores them as N child thoughts |
| **Duplicate review** (deferred from Phase A) | ❌ | no vector-similarity scan; no `/inspector?tab=duplicates` |

**Smallest follow-up (highest leverage)**: schedule `adaptive-capture-classification` to fire on every `thoughts.createThought` where `metadata.type` is unset. This validates that LLM-tools-as-services compose with the scheduled-action primitive Phase B established.

---

## Phase F — Professional CRM ⚠️ framework-only

| Spec item | Status | Evidence |
| --- | --- | --- |
| `interactions` table | ✅ | `schema.ts` |
| `apps/dashboard/src/routes/crm.tsx` (index) | ✅ | committed |
| **Entity schema extensions for `person`** | ❌ | `entities.metadata` is still `v.any()`. No structured `{ title, company: entityRef, email, phone, last_contact_at }` |
| **Entity schema extensions for `org`** | ❌ | same — no `{ industry, hq, headcount_estimate }` |
| **`/crm/$personId` detail route** | ❌ | only the index ships |
| **`/crm/$orgId` detail route** | ❌ | same |
| Skill pack: `relationship-development` | ✅ | in `packages/skills/skills/` |

**Smallest follow-up**: add a discriminated-union to `entities.metadata` via a Zod schema in `packages/shared` — keep the Convex validator as `v.any()` (per the CLAUDE.md pattern), narrow at the boundary. Then ship the two detail routes.

---

## Phase G — Life engine ❌ not started (kernel exists)

Spec: "scope not defined yet — re-scope at the start of the phase". Likely shape per ARCHITECTURE.md: scheduled briefings consuming recent thoughts + entities + a "world-model" instruction-grade thought, producing structured briefing thoughts back.

| Spec item | Status | Evidence |
| --- | --- | --- |
| `briefings` table | ✅ | `schema.ts` (already added in Phase B's diff) |
| `briefings.generateForUserInternal` action | ✅ | `briefings.ts` |
| `apps/dashboard/src/routes/briefings.tsx` | ✅ | committed |
| Skill pack `life-engine` | ✅ | `packages/skills/skills/life-engine/` |
| **World-model "instruction-grade" thought consumed as input** | ❌ | the briefing action doesn't read instruction-grade thoughts as a separate signal |
| **Briefings emitted back as `thoughts` rows** | ❌ | briefings live in their own table; no cross-link into the thought stream |
| **Re-scope decision** | ❌ | not documented |

**Smallest follow-up**: write a one-page Phase G scope doc before touching code. The kernel is there; the unique value-add (instruction-grade input → briefing-thought output loop) needs design before implementation.

---

## Cross-cutting gaps

1. **`docs/ob1-mapping.md`** — Phase A roadmap promises this as the running cross-reference. Doesn't exist. Low effort.
2. **Vector-similarity scan as a primitive** — needed by Phase E duplicate review *and* by any "find related thoughts" feature. Not built. Would be a `services/related-thoughts.ts` style addition with a Vectorize query helper.
3. **Capture surface beyond CLI + dashboard** — Slack, Discord, Telegram, email-as-capture. Listed as post-v1 in ARCHITECTURE.md but pre-Phase D in the original non-goals. Untouched; pending design.
4. **Phase E persistence pattern** — the three LLM MCP tools are read-only by design; the schedule-and-persist counterparts (Convex internal actions) are the gap. One pattern (`classifyAction.scheduledInternal`) would unblock all three.
5. **OB1 data import** — folded into Phase D; not started. Blocks anyone wanting to migrate from OB1.

---

## Suggested priority order if attacking these

1. **Phase E persistence** — small, high leverage. One Convex internal action pattern → unblocks `adaptive-capture-classification` + `thought-enrichment` + `panning-for-gold` persistence.
2. **Duplicate review (Phase E carryover)** — adds the vector-similarity primitive that other features will reuse.
3. **Gmail importer (Phase D)** — validates the `Importer` interface against a real source.
4. **Phase F entity schema extensions + detail routes** — small, narrow, ships a visible feature.
5. **`docs/ob1-mapping.md`** — documentation hygiene; helps anyone reviewing the repo orient.
6. **Phase G scope doc** — design only, no code.

OB1 data import and capture-surface integrations are large enough that they deserve their own decision before scheduling.

---

## Resolved gaps (2026-05-19)

This section documents what landed in the follow-up pass to the original
audit. Every item below has tests + green `bun run check`.

### Phase E persistence ✅

- New `convex/thoughtsAction.ts`: three internal actions —
  `classifyOnCaptureInternal`, `enrichThoughtInternal`,
  `splitBrainDumpInternal`. Each calls the Workers AI
  metadata/splitter adapter (via the dashboard worker chat bridge) and
  persists via internal mutations on `thoughts.ts`.
- New `thoughts` internal mutations: `setTypeInternal`,
  `mergeMetadataInternal`, `persistSplitInternal`.
- Schema: `thoughts.parentThoughtId` (optional `v.id("thoughts")`) +
  `by_user_parent` index. Pan-for-gold children link back to their
  brain-dump parent.
- `thoughts.createThought` and `createThoughtInternal` schedule
  `classifyOnCaptureInternal` when `metadata.type` is unset.
- New `thoughts.childrenOfThought` query for the (future) split-detail UI.

### Duplicate review primitive ✅ (UI deferred)

- `packages/services/src/related-thoughts.ts`: re-embeds the source
  thought, queries Vectorize for top-k neighbors, filters out self,
  hydrates from Convex. Tenant-scoped via the existing `userId`
  namespace.
- New MCP tool `related_thoughts` in `apps/mcp/src/mcp/tools/`. Wired
  into `server.ts`.
- New Zod schema `relatedThoughtsInputSchema` / `…OutputSchema` in
  `packages/shared`.
- **Still deferred**: the dashboard `/inspector?tab=duplicates` UI. The
  primitive is ready; the UI needs a Convex→Worker Vectorize bridge
  (Convex doesn't have a Vectorize binding). Tracked as follow-up.

### Phase F entity schema extensions + CRM routes ✅

- New `packages/shared/src/entities.ts`: discriminated union via Zod for
  `person` and `org` metadata. Convex validator stays `v.any()` (per the
  CLAUDE.md pattern); `tryParseEntityMetadata` narrows at the dashboard
  boundary.
- New Convex mutation `crm.updateEntityMetadata` validates with Zod and
  rejects cross-kind writes (`INVALID`).
- New dashboard routes `/crm/$personId` and `/crm/$orgId` with profile
  + interactions sections. `/crm` index now links into the kind-specific
  detail routes.

### Phase G — scope doc + world-model wiring + briefings-as-thoughts ✅

- New `docs/phase-g-scope.md` — one-page scope doc per gap-analysis
  recommendation.
- New `convex/briefingsAction.generateForUserInternal`: reads recent
  thoughts + world-model thought + entities, summarizes via Workers AI,
  records the briefing via `briefings.recordInternal`. Skipped when
  `DASHBOARD_WORKER_URL` / `INTERNAL_API_SECRET` are unset (best-effort,
  parallel to `digestsAction`).
- `briefings.recordInternal` now writes a paired `thoughts` row with
  `metadata.type === "briefing"` and `source: "life-engine:briefing"`.
  Idempotent on `(userId, date)` via a derived fingerprint.
- New `convex/briefingsCron.ts` + cron entry in `crons.ts`. Fans out
  30 min after digests so token spend is staggered.
- New public action `briefingsAction.regenerateForMe` for the
  `/briefings` "regenerate now" button.

### Importer contract test (Phase D) ✅

- `packages/ingest/src/sources/contract.ts` — `runImporterContract`
  drives any `Importer` through `begin → nextBatch* → finalize` and
  surfaces invariants. Future real sources (Gmail, Obsidian, …) can
  reuse this to prove they satisfy the protocol.
- `packages/ingest/src/sources/in-memory.ts` — reference `Importer`
  fixture for tests.
- Contract tests in `packages/ingest/tests/sources/contract.test.ts`
  cover: exhaustion, empty source, resumeCursor, and a deliberately
  broken importer (empty batch + non-null cursor → contract violation).

### docs/ob1-mapping.md ✅

- Lands at `docs/ob1-mapping.md`. Tables for capture/retrieval, agent
  memory sidecars, skill packs, Phase E workflow primitives, the
  entity model, the CRM extension, briefings, and import/export.

### Still deferred (explicit user decision required)

- **Gmail importer + exporter** (Phase D reference): OAuth strategy
  (Clerk Google connection vs separate stored token) and export format
  (label vs mbox-to-R2) are decision points. The Importer interface is
  now contract-tested, so when those decisions are made the
  implementation is a single source module.
- **OB1 data import** (1536d → 1024d re-embed): listed in the original
  gap analysis as "large enough that they deserve their own decision
  before scheduling." Confirmed deferred.
- **`/inspector?tab=duplicates` UI**: the primitive is in
  `services/related-thoughts.ts` + the MCP tool. UI is follow-up.
- **Capture-surface integrations** (Slack/Discord/Telegram, email-as-
  capture): per ARCHITECTURE.md post-v1 roadmap, untouched.
