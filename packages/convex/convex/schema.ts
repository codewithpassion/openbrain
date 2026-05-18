import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Mirrors the zod schemas in @openbrains/shared. Convex `v.*` validators are not
// TypeScript `any` — see CLAUDE.md §2. memory_audit.diff is genuinely opaque.

export default defineSchema({
  thoughts: defineTable({
    userId: v.string(),
    content: v.string(),
    source: v.string(),
    vectorizeId: v.optional(v.string()),
    embeddingModel: v.string(),
    embeddingDims: v.number(),
    fingerprint: v.string(),
    metadata: v.object({
      type: v.optional(v.string()),
      topics: v.array(v.string()),
      people: v.array(v.string()),
      action_items: v.array(v.string()),
      dates_mentioned: v.array(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_fingerprint", ["userId", "fingerprint"]),

  memory_provenance: defineTable({
    thoughtId: v.id("thoughts"),
    userId: v.string(),
    origin: v.union(
      v.literal("human"),
      v.literal("agent_inferred"),
      v.literal("agent_generated"),
      v.literal("import"),
    ),
    agent: v.optional(v.string()),
    agentVersion: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    capturedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_thought", ["thoughtId"]),

  memory_review: defineTable({
    thoughtId: v.id("thoughts"),
    userId: v.string(),
    status: v.union(
      v.literal("unreviewed"),
      v.literal("confirmed"),
      v.literal("rejected"),
      v.literal("needs_revision"),
    ),
    reviewer: v.string(),
    reviewedAt: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_thought", ["thoughtId"]),

  memory_use_policy: defineTable({
    thoughtId: v.id("thoughts"),
    userId: v.string(),
    trustGrade: v.union(v.literal("instruction"), v.literal("evidence"), v.literal("draft")),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_thought", ["thoughtId"]),

  memory_source_refs: defineTable({
    thoughtId: v.id("thoughts"),
    userId: v.string(),
    kind: v.string(),
    uri: v.string(),
    excerpt: v.optional(v.string()),
  }).index("by_thought", ["thoughtId"]),

  memory_recall_traces: defineTable({
    thoughtId: v.id("thoughts"),
    userId: v.string(),
    query: v.string(),
    score: v.number(),
    clientId: v.string(),
    at: v.number(),
  })
    .index("by_user_at", ["userId", "at"])
    .index("by_thought", ["thoughtId"]),

  memory_audit: defineTable({
    thoughtId: v.optional(v.id("thoughts")),
    userId: v.string(),
    action: v.string(),
    actor: v.string(),
    at: v.number(),
    diff: v.any(),
  }).index("by_user_at", ["userId", "at"]),

  api_keys: defineTable({
    userId: v.string(),
    hash: v.string(),
    name: v.string(),
    scopes: v.array(v.string()),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["hash"]),
});
