import type { ThoughtMetadata } from "@openbrains/shared";
import type { MetadataExtractor } from "./types";

/**
 * Deterministic metadata extractor for tests and downstream package tests.
 * Always returns the same shape; never inspects input.
 */
export function createFakeMetadataExtractor(): MetadataExtractor {
  return {
    extract: (_content) =>
      Promise.resolve<ThoughtMetadata>({
        type: "observation",
        topics: ["test"],
        people: [],
        action_items: [],
        dates_mentioned: [],
      }),
  };
}
