import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Mirrors the zod schemas in @openbrains/shared. Convex `v.*` validators are not
// TypeScript `any` — see CLAUDE.md §2. memory_audit.diff is genuinely opaque.

export default defineSchema({
  // Project namespace within a user's brain. A user has one connected brain;
  // `scope` lets them target a subset ("work", "side-project-x"). Unscoped
  // thoughts (scope undefined) are visible regardless of scope filter — they
  // are "personal/global" memory.
  projects: defineTable({
    userId: v.string(),
    slug: v.string(), // URL/CLI-friendly identifier — `(userId, slug)` unique
    name: v.string(), // human label
    description: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_slug", ["userId", "slug"])
    .index("by_user_created", ["userId", "createdAt"]),

  thoughts: defineTable({
    userId: v.string(),
    content: v.string(),
    source: v.string(),
    // Optional project scope. Validated against the `projects` table at write
    // time. Unscoped (undefined) = visible from any project view.
    scope: v.optional(v.string()),
    vectorizeId: v.optional(v.string()),
    embeddingModel: v.string(),
    embeddingDims: v.number(),
    fingerprint: v.string(),
    // Phase E: panning-for-gold persistence. A child thought split out of a
    // brain-dump references its parent here so the lineage survives later
    // edits / re-embeds. Optional — most thoughts have no parent.
    parentThoughtId: v.optional(v.id("thoughts")),
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
    .index("by_user_fingerprint", ["userId", "fingerprint"])
    .index("by_user_parent", ["userId", "parentThoughtId"])
    .index("by_user_scope_created", ["userId", "scope", "createdAt"])
    // Scope-aware dedup. Same content can exist in different scopes (e.g.
    // "deploy script" idea in `work` and `side-project`); fingerprint
    // uniqueness is per (userId, scope).
    .index("by_user_scope_fingerprint", ["userId", "scope", "fingerprint"]),

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

  // Phase B: daily digests, stored locally. Email/Slack delivery is deferred.
  digests: defineTable({
    userId: v.string(),
    date: v.string(), // ISO YYYY-MM-DD — the window's *end* day (UTC)
    summary: v.string(),
    thoughtIds: v.array(v.id("thoughts")),
    thoughtCount: v.number(),
    generator: v.string(), // e.g. "openrouter:openai/gpt-4o-mini" — track for migrations
    generatedAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_generated", ["userId", "generatedAt"]),

  // Phase G: life engine — proactive daily briefing per user.
  briefings: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD UTC
    summary: v.string(),
    sections: v.object({
      recent: v.array(v.string()),
      followUps: v.array(v.string()),
      openQuestions: v.array(v.string()),
    }),
    thoughtIds: v.array(v.id("thoughts")),
    generator: v.string(),
    generatedAt: v.number(),
  })
    .index("by_user_date_briefings", ["userId", "date"])
    .index("by_user_generated_briefings", ["userId", "generatedAt"]),

  // Phase B: scheduled-job run log. Lets the /jobs page show "last run X ago".
  job_runs: defineTable({
    name: v.string(), // e.g. "digests.daily"
    userId: v.optional(v.string()), // optional — some jobs are global
    status: v.union(v.literal("success"), v.literal("failure"), v.literal("skipped")),
    startedAt: v.number(),
    finishedAt: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_name_started", ["name", "startedAt"])
    .index("by_user_started", ["userId", "startedAt"]),

  // Phase C: entity model. `kind` is a free-form string so domain extensions
  // can introduce new kinds (CRM adds "person"/"org" subtypes; Life Engine
  // adds "habit"/"goal"). Canonical names are unique per (user, kind, name).
  entities: defineTable({
    userId: v.string(),
    kind: v.string(),
    canonicalName: v.string(),
    aliases: v.array(v.string()),
    metadata: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_kind_name", ["userId", "kind", "canonicalName"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  entity_mentions: defineTable({
    userId: v.string(),
    entityId: v.id("entities"),
    thoughtId: v.id("thoughts"),
    span: v.optional(v.object({ start: v.number(), end: v.number() })),
    createdAt: v.number(),
  })
    .index("by_user_entity", ["userId", "entityId"])
    .index("by_user_thought", ["userId", "thoughtId"]),

  entity_relations: defineTable({
    userId: v.string(),
    fromEntityId: v.id("entities"),
    toEntityId: v.id("entities"),
    kind: v.string(),
    evidenceThoughtIds: v.array(v.id("thoughts")),
    confidence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_from", ["userId", "fromEntityId"])
    .index("by_user_to", ["userId", "toEntityId"])
    .index("by_user_kind", ["userId", "kind"]),

  // Phase F: CRM interactions. References an entity (person or org) and the
  // thought that recorded the contact. `kind` is free-form so domain code can
  // introduce new categories; the dashboard groups by the canonical set
  // (meeting, call, email, note).
  interactions: defineTable({
    userId: v.string(),
    entityId: v.id("entities"),
    thoughtId: v.id("thoughts"),
    kind: v.string(),
    at: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_user_entity_at", ["userId", "entityId", "at"])
    .index("by_user_at", ["userId", "at"]),

  // Phase D: long-running import/export jobs.
  imports: defineTable({
    userId: v.string(),
    source: v.string(), // "gmail" | "obsidian" | "chatgpt" | "brain-restore" | ...
    direction: v.union(v.literal("import"), v.literal("export")),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("success"),
      v.literal("failure"),
      v.literal("cancelled"),
    ),
    cursor: v.optional(v.string()), // source-specific resume marker
    stats: v.object({
      processed: v.number(),
      created: v.number(),
      skipped: v.number(),
      errors: v.number(),
    }),
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_status", ["userId", "status"]),
});
