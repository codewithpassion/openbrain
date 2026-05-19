/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_audit from "../_lib/audit.js";
import type * as _lib_identity from "../_lib/identity.js";
import type * as aiAction from "../aiAction.js";
import type * as apiKeys from "../apiKeys.js";
import type * as entities from "../entities.js";
import type * as http from "../http.js";
import type * as memory_audit from "../memory/audit.js";
import type * as memory_provenance from "../memory/provenance.js";
import type * as memory_recall from "../memory/recall.js";
import type * as memory_recallTraces from "../memory/recallTraces.js";
import type * as memory_review from "../memory/review.js";
import type * as memory_sourceRefs from "../memory/sourceRefs.js";
import type * as memory_usePolicy from "../memory/usePolicy.js";
import type * as memory_writeback from "../memory/writeback.js";
import type * as thoughts from "../thoughts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/audit": typeof _lib_audit;
  "_lib/identity": typeof _lib_identity;
  aiAction: typeof aiAction;
  apiKeys: typeof apiKeys;
  entities: typeof entities;
  http: typeof http;
  "memory/audit": typeof memory_audit;
  "memory/provenance": typeof memory_provenance;
  "memory/recall": typeof memory_recall;
  "memory/recallTraces": typeof memory_recallTraces;
  "memory/review": typeof memory_review;
  "memory/sourceRefs": typeof memory_sourceRefs;
  "memory/usePolicy": typeof memory_usePolicy;
  "memory/writeback": typeof memory_writeback;
  thoughts: typeof thoughts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
