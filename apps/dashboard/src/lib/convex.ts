import { ConvexReactClient } from "convex/react";
import { getClientEnv } from "../env";

let cached: ConvexReactClient | null = null;

/**
 * Lazily construct a single `ConvexReactClient` per browser tab.
 * Server-side rendering uses a fresh client wired up through the
 * `ConvexProviderWithClerk` in `__root.tsx`.
 */
export function getConvexClient(): ConvexReactClient {
  if (cached !== null) {
    return cached;
  }
  const { VITE_CONVEX_URL } = getClientEnv();
  cached = new ConvexReactClient(VITE_CONVEX_URL, { unsavedChangesWarning: false });
  return cached;
}
