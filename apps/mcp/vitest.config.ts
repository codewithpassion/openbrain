import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Integration-test config: spins up the Worker in Miniflare and runs the
 * `tests/integration/*` files inside it.
 *
 * Kept disjoint from the Bun-based unit tests under `tests/auth/` and
 * `tests/mcp/`. `bun test` is the default; this config is invoked via
 * `bun --filter @openbrains/mcp test:integration`.
 *
 * NOTE: we intentionally do NOT reference `wrangler.jsonc` here. The
 * production wrangler config binds `AI` and `VECTORIZE`, which are remote-only
 * bindings that force vitest-pool-workers into "remote proxy" mode and
 * require a Cloudflare account login. The test instead configures miniflare
 * inline with only the bindings needed to exercise auth-prop propagation.
 */

// biome-ignore lint/style/noDefaultExport: Vitest config uses default export.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "src/index.ts",
      miniflare: {
        compatibilityDate: "2026-05-01",
        compatibilityFlags: ["nodejs_compat"],
        kvNamespaces: ["OAUTH_KV"],
        bindings: {
          CONVEX_URL: "https://example.convex.cloud",
          CLERK_DOMAIN: "example.clerk.accounts.dev",
          EMBEDDING_MODEL: "@cf/qwen/qwen3-embedding-0.6b",
          CLERK_JWKS_URL: "https://example.clerk.accounts.dev/.well-known/jwks.json",
          CLERK_CLIENT_ID: "test-client-id",
          CLERK_CLIENT_SECRET: "test-client-secret",
          INTERNAL_API_SECRET: "test-internal-secret",
          DEVICE_FLOW_SECRET: "integration-test-device-flow-secret-32b!",
        },
      },
    }),
  ],
  test: {
    include: ["tests/integration/**/*.test.ts"],
  },
});
