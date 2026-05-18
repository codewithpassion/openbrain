import type { Id } from "../../convex/_generated/dataModel.js";

export interface ThoughtFixture {
  userId: string;
  content: string;
  source: string;
  embeddingModel: string;
  embeddingDims: number;
  fingerprint: string;
  metadata: {
    topics: string[];
    people: string[];
    action_items: string[];
    dates_mentioned: string[];
    type?: string;
  };
  createdAt: number;
  updatedAt: number;
}

export function makeThought(
  userId: string,
  overrides: Partial<ThoughtFixture> = {},
): ThoughtFixture {
  const now = Date.now();
  return {
    userId,
    content: "a sample thought",
    source: "dashboard",
    embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
    embeddingDims: 1024,
    fingerprint: "a".repeat(64),
    metadata: {
      topics: [],
      people: [],
      action_items: [],
      dates_mentioned: [],
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export type ThoughtId = Id<"thoughts">;
