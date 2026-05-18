# CLAUDE.md — openbrains

Read this **before** writing or modifying any code in this repo. These rules are non-negotiable. Any sub-agent working in this repo inherits this file.

## What this project is

A reimplementation of [Open Brain (OB1)](https://github.com/NateBJones-Projects/OB1) on Cloudflare + Convex + Clerk, with a remote MCP server so any AI client (Claude Desktop, Codex, Cursor, ChatGPT) can plug into one persistent, governed memory. Read `ARCHITECTURE.md` for the full design — that doc is the source of truth for what we are building.

## Stack — non-negotiable

| Layer | Choice |
| --- | --- |
| Package manager / runtime | **Bun** (never npm, yarn, or pnpm) |
| Monorepo | **Turborepo** |
| Language | **TypeScript strict** (see `tsconfig.base.json`) |
| Lint + format | **Biome** with aggressive rules (see `biome.json`) |
| Backend data | **Convex** (with Clerk JWT auth) |
| Vector store | **Cloudflare Vectorize** (1024-dim, cosine, namespace = userId) |
| Embeddings | **Workers AI `@cf/qwen/qwen3-embedding-0.6b`** (1024d, 4096 tokens) |
| MCP server | **Cloudflare Worker** + `@modelcontextprotocol/sdk` + `agents` (`createMcpHandler`) |
| MCP auth | **`@cloudflare/workers-oauth-provider`** delegating to **Clerk** as IdP |
| Dashboard | **TanStack Start** (CF Workers template) + **shadcn/ui** + Clerk |
| Auth (users) | **Clerk** |
| CLI | **Bun** binary, OAuth device flow |

Wrangler env files use **`.env*`** (not `.dev.vars`). See "Cloudflare wrangler" in the user's global notes.

## Engineering rules — non-negotiable

### 1. TDD: Red → Green → Refactor

Every new module starts with a failing test. Do not write implementation before the test. The cycle:

1. **Red**: write the test, run it, see it fail for the right reason.
2. **Green**: write the **minimum** code to make it pass.
3. **Refactor**: only after green. Tests stay green throughout.

Bun's built-in test runner (`bun test`) is the default. For Convex use `convex-test`. For Workers use `vitest` + `@cloudflare/vitest-pool-workers`.

Coverage isn't the goal — meaningful, behavior-anchored tests are. One assertion per scenario. Name tests by behavior, not function name: `"rejects capture when content exceeds 4096 tokens"`, not `"capture_thought test"`.

### 2. No `any`. No shortcuts.

- `noExplicitAny` is `error` in Biome.
- `noImplicitAny`, `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` all on.
- If a type is genuinely unknown at a boundary, use `unknown` and narrow with a Zod schema or a type guard. **Not** `any`, **not** `@ts-ignore`, **not** `as` casts that lie.
- External libraries with broken types: declare a narrow ambient type in `src/types/<lib>.d.ts` rather than spreading `any` through the codebase.
- **`@ts-expect-error` is permitted in tests only**, when asserting a type-level negative case (e.g. proving a branded type prevents a raw string from being passed). Never in production code.
- **Convex `v.any()` is not TypeScript `any`** — it's a validator namespace. The Convex schema may use `v.any()` for genuinely-opaque fields (e.g. audit-log diffs); the corresponding Zod schema in `packages/shared` must use `z.unknown()` and downstream code must narrow.

### 3. Surgical changes, simplicity first

Repeat from the user's global CLAUDE.md (which still applies):

- Touch only what the task requires.
- No speculative abstractions, no flexibility that wasn't asked for.
- Minimum code that solves the problem.
- If a senior engineer would call it overcomplicated, simplify.

### 4. The check gate

Before declaring any task complete:

```bash
bun run check
```

This runs `biome check .` + `tsc --noEmit` across the workspace + `turbo run test`. **Must be green.** If it isn't, the task isn't done.

Pre-commit must run `bun run check`. CI will too.

### 5. Validation at boundaries

- Every MCP tool input is parsed by a Zod schema from `packages/shared`. No raw bag-of-strings.
- Every Convex mutation validates its arguments via Convex's `v.*` validators.
- HTTP requests into the Worker are validated before they reach business logic.
- Inside the trust boundary, types are real — no defensive re-validation.

### 6. Tenant safety

Every Convex query and mutation **must** filter by `userId` from the authenticated Clerk identity. There is no admin-overriding-userId path in v1. A query that forgets the filter is a tenancy leak — a P0 bug, not a style issue.

Vectorize: every upsert and query uses `namespace = userId`. Cross-tenant query is impossible by construction, not by convention.

### 7. Memory provenance & trust grade

When writing to the Agent Memory sidecars: inferred or generated memory defaults to `trustGrade: "evidence"`. Promotion to `"instruction"` requires an explicit human-confirmed mutation (`memory_review`). Do not auto-promote, do not silently accept agent-supplied trust grades on write.

### 8. Module portability (from user global rules)

Each `apps/*` and `packages/*` is a self-contained unit:
- No imports across siblings except via the package's public `index.ts`.
- No reaching into `../other-package/src/internals`.
- Cross-package dependencies declared in `package.json`.
- A package should be deletable by removing its folder without breaking unrelated code.

### 9. Errors

- Throw `Error` subclasses, not strings or objects.
- Convex functions throw `ConvexError` for user-visible failures.
- MCP tools return `{ isError: true, content: [...] }` for tool-level failures; only throw for programmer errors.
- Never swallow errors with bare `catch {}`. If you intentionally ignore, comment why.

### 10. No `console.log`

Biome treats `console.log` as an error (`console.warn`/`error`/`info` are allowed for legitimate diagnostics). Use the test framework's assertions or a typed logger.

## Repo layout

```
openbrains/
├── ARCHITECTURE.md        # design doc — source of truth for "what"
├── CLAUDE.md              # this file — source of truth for "how"
├── biome.json             # aggressive lint config
├── turbo.json
├── tsconfig.base.json
├── package.json           # bun workspaces
├── apps/
│   ├── mcp/               # CF Worker: MCP server + OAuth
│   ├── dashboard/         # TanStack Start + shadcn + Clerk
│   └── cli/               # `ob` CLI
└── packages/
    ├── shared/            # zod schemas + tool contracts (shared types)
    ├── ingest/            # embedding + fingerprint + metadata extraction
    └── convex/            # Convex schema + functions
```

## Common commands

```bash
bun install                 # install all workspace deps
bun run check               # the gate: lint + typecheck + test
bun run lint:fix            # auto-fix what Biome can
bun run test                # tests across the workspace (turbo)
bun --filter <name> <cmd>   # run a script in a specific workspace
```

## Conventions

- **Filenames**: kebab-case for source and test files (Biome enforces `kebab-case | camelCase | PascalCase` only — no snake_case, no UPPERCASE).
- **Exported symbols**: camelCase for values (`searchThoughtsInputSchema`), PascalCase for types and classes (`SearchThoughtsInput`, `OpenBrainsError`).
- **Branded IDs**: when comparing a `ThoughtId` against a string literal in tests, bind to `const id: string = ThoughtId.parse(...)` to strip the brand at the variable boundary — never use `as string` to launder the type.
- **Conflict resolution**: when a task's explicit "files to create" list disagrees with ARCHITECTURE.md or another spec section, **files-to-create wins**. The agent flags the gap in its final report. Do not silently expand scope.

## Working with sub-agents

When you spawn a sub-agent for a task in this repo:

1. Tell it to read this file and `ARCHITECTURE.md` **before** writing code.
2. Tell it exactly which package/app it owns and that it must not touch others.
3. Require it to leave `bun run check` green when it finishes.
4. Require TDD: failing test in the diff first, then the implementation.

Don't push synthesis onto the agent ("based on your findings, implement it"). Give it the specific files, types, and behavior to build.
