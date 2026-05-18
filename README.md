# openbrains

A persistent, governed AI memory system. Any AI client plugs in via MCP and shares the same brain.

Reimplementation of [Open Brain (OB1)](https://github.com/NateBJones-Projects/OB1) on Cloudflare + Convex + Clerk.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design and [`CLAUDE.md`](./CLAUDE.md) for the engineering rules.

## Quick start

```bash
bun install
bun run check     # lint + typecheck + test
```

## Workspaces

- `apps/mcp` — Cloudflare Worker hosting the MCP server (OAuth via Clerk)
- `apps/dashboard` — TanStack Start dashboard (shadcn/ui)
- `apps/cli` — `ob` CLI
- `packages/shared` — shared Zod schemas and types
- `packages/ingest` — embedding pipeline and content fingerprint
- `packages/convex` — Convex schema and functions

## License

To be determined. OB1 is FSL-1.1-MIT; this project is an independent reimplementation, not a derivative work.
