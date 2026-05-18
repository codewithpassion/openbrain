/* eslint-disable */
/**
 * Generated API references. Hand-maintained — see _generated/dataModel.ts.
 *
 * Runtime is `anyApi` (untyped property tree). Types are derived from each
 * function module so callers retain compile-time safety on args/returns.
 */
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import { anyApi } from "convex/server";
import type * as apiKeys from "../apiKeys.js";
import type * as http from "../http.js";
import type * as memory_audit from "../memory/audit.js";
import type * as memory_provenance from "../memory/provenance.js";
import type * as memory_recallTraces from "../memory/recallTraces.js";
import type * as memory_review from "../memory/review.js";
import type * as memory_sourceRefs from "../memory/sourceRefs.js";
import type * as memory_usePolicy from "../memory/usePolicy.js";
import type * as thoughts from "../thoughts.js";

declare const fullApi: ApiFromModules<{
  thoughts: typeof thoughts;
  apiKeys: typeof apiKeys;
  http: typeof http;
  "memory/provenance": typeof memory_provenance;
  "memory/review": typeof memory_review;
  "memory/usePolicy": typeof memory_usePolicy;
  "memory/sourceRefs": typeof memory_sourceRefs;
  "memory/recallTraces": typeof memory_recallTraces;
  "memory/audit": typeof memory_audit;
}>;

// biome-ignore lint/suspicious/noExplicitAny: FunctionReference<any> is the canonical Convex codegen output
export const api: FilterApi<typeof fullApi, FunctionReference<any, "public">> = anyApi as never;
export const internal: FilterApi<
  typeof fullApi,
  // biome-ignore lint/suspicious/noExplicitAny: FunctionReference<any> is the canonical Convex codegen output
  FunctionReference<any, "internal">
> = anyApi as never;
