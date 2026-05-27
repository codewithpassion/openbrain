# OB1 → openbrains mapping

This is the running cross-reference between [Open Brain (OB1)](https://github.com/NateBJones-Projects/OB1) concepts and where the equivalent lives in this repo. Promised in Phase A of `ARCHITECTURE.md`; lives here so reviewers can orient quickly.

Last updated: 2026-05-19. Keep this current alongside new OB1-shaped features.

## Capture & retrieval

| OB1 concept | openbrains equivalent | Notes |
| --- | --- | --- |
| `thoughts` table (1536d OpenAI embeddings) | `packages/convex/convex/schema.ts` → `thoughts` (1024d Qwen3) | Dimensions changed — see ARCHITECTURE.md "Decisions locked". Re-embed pass for OB1 dumps is a separate scoped task. |
| Fingerprint dedup primitive | `packages/ingest/src/fingerprint.ts` (`contentFingerprint`) | SHA-256 over normalized content. Async (`crypto.subtle.digest`), Worker-safe. |
| Capture pipeline | `services/capture-thought.ts` + `convex/thoughts.createThought` + `Vectorize.upsert` | Service is platform-neutral; MCP Worker and CLI both call it. |
| Semantic search | `services/search-thoughts.ts` → MCP tool `search_thoughts` | OB1 uses pgvector cosine; we use Vectorize cosine, same primitive. |
| ChatGPT-compatible search/fetch | MCP tools `search` and `fetch` | Compatibility shim for ChatGPT connectors. |

## Agent memory sidecars

OB1's `agent-memory` schemas are mirrored as Convex sidecar tables, one-to-one. The OB1 guardrail "inferred memory defaults to `evidence`; promotion to `instruction` requires human confirmation" is enforced in code (see `memory/writeback.ts` and `memory/review.ts`).

| OB1 sidecar | Convex table | Provider module |
| --- | --- | --- |
| `provenance` | `memory_provenance` | `convex/memory/provenance.ts` |
| `review` | `memory_review` | `convex/memory/review.ts` |
| `use_policy` | `memory_use_policy` | `convex/memory/usePolicy.ts` |
| `source_refs` | `memory_source_refs` | `convex/memory/sourceRefs.ts` |
| `recall_traces` | `memory_recall_traces` | `convex/memory/recallTraces.ts` |
| `audit` | `memory_audit` | `convex/memory/audit.ts` (+ `_lib/audit.ts`) |

MCP tools `memory_recall`, `memory_writeback`, `memory_review` expose the sidecar surface to AI clients.

## Skill packs

OB1 ships 16 skill packs. openbrains mirrors the convention (`skill.json` + `prompt.md`) in `packages/skills/skills/`. All 16 are populated. Mapping:

| OB1 pack | openbrains pack | Status |
| --- | --- | --- |
| `research-synthesis` | `packages/skills/skills/research-synthesis/` | shipped (Phase A) |
| `meeting-synthesis` | `packages/skills/skills/meeting-synthesis/` | shipped (Phase A) |
| `panning-for-gold` | `packages/skills/skills/panning-for-gold/` | shipped (Phase A) |
| `relationship-development` | `packages/skills/skills/relationship-development/` | shipped (Phase F) |
| `life-engine` | `packages/skills/skills/life-engine/` | shipped (Phase G kernel) |
| remaining OB1 packs | `packages/skills/skills/<pack-name>/` | shipped through Phase E |

## Workflow primitives (Phase E)

| OB1 workflow | LLM tool (read-only) | Persistence (scheduled action) |
| --- | --- | --- |
| Adaptive capture classification | `classify_thought` | `thoughtsAction.classifyOnCaptureInternal` (fires on `createThought` when `metadata.type` is unset) |
| Thought enrichment | `enrich_thought` | `thoughtsAction.enrichThoughtInternal` + `thoughts.mergeMetadataInternal` |
| Panning for gold | `pan_brain_dump` | `thoughtsAction.splitBrainDumpInternal` + `thoughts.persistSplitInternal` (children carry `parentThoughtId`) |
| Duplicate review | `related_thoughts` (MCP tool) + `services/related-thoughts.ts` | UI tab `/inspector?tab=duplicates` — primitive in place; dashboard scan deferred |

## Entity model (Phase C)

OB1's wiki-style entity navigation maps to:

| OB1 surface | openbrains surface |
| --- | --- |
| Entities list | `apps/dashboard/src/routes/entities.tsx` |
| Entity wiki page | `apps/dashboard/src/routes/entities.$id.tsx` |
| Force-directed graph | `apps/dashboard/src/routes/graph.tsx` (`react-force-graph-2d`) |
| Extraction pipeline | `convex/entitiesAction.extractFromThoughtInternal` |
| MCP tools | `list_entities`, `get_entity`, `entity_relations` |

## CRM extension (Phase F)

Built on the entity model: `kind: "person"` and `kind: "org"` entities gain structured metadata via the Zod schemas in `packages/shared/src/entities.ts`. The Convex validator stays `v.any()` (per the CLAUDE.md pattern); Zod is the boundary.

| OB1 / OB1-adjacent surface | openbrains surface |
| --- | --- |
| Person profile | `/crm/$personId` |
| Org profile | `/crm/$orgId` |
| Interaction log | `convex/crm.recordInteraction` + `interactions` table |
| Profile updates | `convex/crm.updateEntityMetadata` |

## Daily digests & briefings

| OB1 concept | openbrains surface |
| --- | --- |
| Daily digest | `convex/digestsAction.generateForUserInternal` + cron in `convex/digestsCron.ts` |
| Briefing ("life engine") | `convex/briefings.generateForUser` (Phase G) |
| Jobs status page | `apps/dashboard/src/routes/jobs.tsx` |

## Import/export (Phase D)

OB1 has bespoke importers per source. openbrains formalizes the contract in `packages/ingest/src/sources/types.ts` (`Importer` interface). The reference implementation is the JSON brain bundle (`sources/bundle.ts`) wired through `convex/brainBackup.ts`. Gmail importer is the next reference source (deferred pending OAuth + format decisions).

## What's intentionally different from OB1

- **Embedding model**: Qwen3 0.6b (1024d, 4096 tokens) instead of OpenAI text-embedding-3-small (1536d, 512 tokens). Bigger context window matters more than higher dims for free-form thoughts.
- **Vector store**: Cloudflare Vectorize (namespace = userId) instead of pgvector. Edge proximity + free namespace filtering carry their weight.
- **Tenancy**: Multi-tenant SaaS by construction. Every Convex query filters by `userId`; every Vectorize call uses `namespace = userId`. OB1 is single-tenant by design.
- **MCP**: First-class remote MCP server with OAuth via `@cloudflare/workers-oauth-provider` delegating to Clerk. OB1 has no MCP surface.
- **CLI**: `ob` is a thin MCP client over the OAuth device flow. Doubles as a reference for how AI clients should integrate.
