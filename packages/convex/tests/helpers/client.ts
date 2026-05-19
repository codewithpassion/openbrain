import type { SchemaDefinition } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import schema from "../../convex/schema";

/**
 * Bun's test runner doesn't implement `import.meta.glob`, so we build the
 * modules map by hand. Every function module must be listed here; the keys
 * are relative paths from the `convex/` directory.
 */
const modules: Record<string, () => Promise<unknown>> = {
  "./_generated/api.ts": () => import("../../convex/_generated/api"),
  "./_generated/server.ts": () => import("../../convex/_generated/server"),
  "./_generated/dataModel.ts": () => import("../../convex/_generated/dataModel"),
  "./schema.ts": () => import("../../convex/schema"),
  "./auth.config.ts": () => import("../../convex/auth.config"),
  "./_lib/identity.ts": () => import("../../convex/_lib/identity"),
  "./_lib/audit.ts": () => import("../../convex/_lib/audit"),
  "./thoughts.ts": () => import("../../convex/thoughts"),
  "./apiKeys.ts": () => import("../../convex/apiKeys"),
  "./http.ts": () => import("../../convex/http"),
  "./aiAction.ts": () => import("../../convex/aiAction"),
  "./entities.ts": () => import("../../convex/entities"),
  "./memory/provenance.ts": () => import("../../convex/memory/provenance"),
  "./memory/review.ts": () => import("../../convex/memory/review"),
  "./memory/usePolicy.ts": () => import("../../convex/memory/usePolicy"),
  "./memory/sourceRefs.ts": () => import("../../convex/memory/sourceRefs"),
  "./memory/recallTraces.ts": () => import("../../convex/memory/recallTraces"),
  "./memory/audit.ts": () => import("../../convex/memory/audit"),
  "./memory/recall.ts": () => import("../../convex/memory/recall"),
  "./memory/writeback.ts": () => import("../../convex/memory/writeback"),
};

export type SchemaType = typeof schema;

export function makeTest(): TestConvex<SchemaDefinition<SchemaType["tables"], true>> {
  return convexTest(schema, modules);
}

export const TEST_USER_A = "user_2abcAlphaAlphaAlpha";
export const TEST_USER_B = "user_2bbbBetaBetaBetaBeta";
