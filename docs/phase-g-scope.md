# Phase G — Life engine — scope

Status: scoped 2026-05-19. Promised in `ARCHITECTURE.md` (re-scope at phase start). One page; aim is to nail down the unique value-add before writing code.

## What Phase G is

A **daily briefing loop**: every day, an action reads the user's recent thoughts + entities + their "world model" instruction-grade thought, and produces a `briefing` (already a table) **and** a corresponding `briefing-thought` (new — gives the briefing first-class citizenship in the thought stream).

The briefing is the consumable surface (dashboard, `/briefings`). The briefing-thought is the substrate that lets future briefings recall "what did I say yesterday" via the same recall path everything else uses.

## What's already in place

| Piece | Status |
| --- | --- |
| `briefings` table | ✅ (added in Phase B's diff) |
| `briefings.recordInternal` (idempotent on `userId,date`) | ✅ |
| `briefings.worldModelForInternal` (finds the instruction-grade world-model thought) | ✅ |
| `briefings.seedWorldModel` (one-shot seed for testing) | ✅ |
| `/briefings` route | ✅ |
| `life-engine` skill pack | ✅ |

## What this phase adds

1. **`briefingsAction.generateForUserInternal`** — the action. Reads recent thoughts (`thoughts` last 24h), entities (`entities.listInternal`), and the world-model thought (`briefings.worldModelForInternal`). Calls the LLM (OpenRouter, same pattern as `digestsAction`). Persists the briefing via `briefings.recordInternal`. Then…
2. **`briefings.recordInternal` emits a child thought** — after writing the briefing row, the same internal mutation inserts a `thoughts` row with `source: "life-engine:briefing"`, `metadata.type: "briefing"`, and the briefing summary as content. The new thought stores no `parentThoughtId` (briefings don't have a parent thought) but its `source` makes provenance explicit. **Sidecars**: a `memory_provenance` row at `origin: "agent_generated"`, `agent: "life-engine"` and a `memory_use_policy` at `trustGrade: "evidence"` (per CLAUDE.md §7 — agent-generated memory defaults to evidence). Idempotent: re-running for the same `(userId, date)` patches the existing briefing **and** patches the existing briefing-thought; sidecars are inserted-if-missing.
3. **`briefingsCron.ts`** — once-daily cron, fans out per user. Mirrors `digestsCron.ts`.
4. **Tests** — TDD. Failing test first for the new mutation behaviour (recordInternal now writes a paired thought) and for the action's skipped-when-env-missing path.

## What this phase does **not** add

- A `briefingThoughtId` column on the `briefings` table. The link runs the other direction: query thoughts by `source: "life-engine:briefing"` filtered to a date label. Avoiding the column keeps the schema migration small and means re-running a briefing doesn't have to update two rows in lockstep.
- A new MCP tool. Phase G is a server-side loop; clients see briefings via the existing `list_thoughts` (filtered) and the dashboard route.
- Email/Slack delivery of briefings. Deferred per the same rule as digests.
- World-model editing UI. The world-model thought is seeded by hand or by an MCP-side write; the dashboard view will follow only if a user actually wants one.

## Risks & open questions

- **Action token cost**: a briefing prompt with 24h of thoughts + the world model + the entity list can get long. The action passes per-thought content; we may need a budget cap (drop oldest, keep newest N) before this scales beyond personal use. v1 ships uncapped; we add the cap when we have signal.
- **World-model ambiguity when multiple instruction-grade thoughts exist**: `worldModelForInternal` returns the most-recent thought with `metadata.type === "world_model"` and a `memory_use_policy` at `trustGrade: "instruction"`. If multiple are present, only the latest is consulted. Document this in the briefing's `summary` so users know which one fed the prompt.
- **Briefing-thought collisions**: the briefing-thought's fingerprint is derived from `(userId, date)`. Re-running for the same `(userId, date)` patches the existing thought row. No collision because the index `by_user_fingerprint` already de-dupes; the fingerprint we choose is stable per `(userId, date)`.

## Done-when

- `bun run check` green.
- Calling `briefingsAction.generateForUserInternal({ userId })` in a test with `OPENROUTER_API_KEY` unset returns `{ status: "skipped" }` and writes no rows.
- Calling `briefings.recordInternal` twice with the same `(userId, date)` results in **one** briefing row and **one** briefing-thought, both updated.
- Calling `briefings.recordInternal` once writes a `thought` row with `metadata.type === "briefing"`.
- Briefing-thoughts surface in `list_thoughts` with `type: "briefing"`.
- Briefing-thoughts surface in `memory_recall` with `provenance.origin === "agent_generated"` and `usePolicy.trustGrade === "evidence"`.
