// Clerk JWT verification config for Convex.
// CLERK_JWT_ISSUER_DOMAIN is set per-deployment via `npx convex env set`.
// In tests, no identity provider is required — convex-test mocks identities directly.

// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket access on process.env
const issuerDomain = process.env["CLERK_JWT_ISSUER_DOMAIN"];

export default {
  providers: [
    {
      domain: issuerDomain ?? "https://example.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
