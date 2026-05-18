# @openbrains/dashboard

TanStack Start app for OpenBrains, deployed to Cloudflare Workers, authenticated with Clerk, and backed by Convex.

## Env vars

Copy `.env.example` to `.env.local`:

| Var | Surface | Purpose |
| --- | --- | --- |
| `VITE_CONVEX_URL` | client + server | Convex deployment URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | client + server | Clerk publishable key (safe to ship) |
| `CLERK_SECRET_KEY` | server only | Clerk backend secret, used by server fns |

On Cloudflare, put `CLERK_SECRET_KEY` in `wrangler secret put` and the public ones in `vars` on `wrangler.jsonc`.

## Dev

```bash
bun --filter @openbrains/dashboard dev    # vite dev on :3000
```

The TanStack router plugin regenerates `src/routeTree.gen.ts` on first dev/build; a stub is checked in so `tsc --noEmit` works offline.

## Build / deploy

```bash
bun --filter @openbrains/dashboard build  # vite build
bun --filter @openbrains/dashboard deploy # wrangler deploy
```

## Tests

`bun test` runs unit tests for `src/lib/*` and pure component view-model functions. Rendering tests are out of scope for v1 — Bun's test runner has no DOM and the TanStack/Clerk/Convex providers don't run cleanly under happy-dom yet. Tracked as a follow-up.

## v1 deviations from `ARCHITECTURE.md`

- **Search is a client-side filter** over the 50 most recent thoughts. Real semantic search (Vectorize) is v2.
- **No SSR-aware Convex queries.** All data is fetched client-side via `ConvexProviderWithClerk`. Server-rendering with Convex auth is a follow-up.
- **No theme toggle, no animations, no charts.** Plain shadcn primitives.
