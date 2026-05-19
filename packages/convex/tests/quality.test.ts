import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import { makeTest, TEST_USER_A } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

describe("quality.reportForUser", () => {
  test("flags thoughts with missing metadata fields and no entities", async () => {
    const t = makeTest();
    const fxBad = makeThought(TEST_USER_A, {
      content: "untagged",
      metadata: {
        topics: [],
        people: [],
        action_items: [],
        dates_mentioned: [],
      },
    });
    await t.withIdentity({ subject: TEST_USER_A }).mutation(api.thoughts.createThought, {
      content: fxBad.content,
      source: fxBad.source,
      embeddingModel: fxBad.embeddingModel,
      embeddingDims: fxBad.embeddingDims,
      fingerprint: "bad".padEnd(64, "0"),
      metadata: fxBad.metadata,
    });
    const report = await t
      .withIdentity({ subject: TEST_USER_A })
      .query(api.quality.reportForUser, { limit: 50 });
    expect(report.totalThoughts).toBe(1);
    expect(report.counts.missingType).toBe(1);
    expect(report.counts.emptyTopics).toBe(1);
    expect(report.counts.noProvenance).toBe(1);
    expect(report.counts.noEntities).toBe(1);
    expect(report.flagged[0]?.reason).toContain("missing type");
  });

  test("rejects unauthenticated callers", async () => {
    const t = makeTest();
    await expect(t.query(api.quality.reportForUser, {})).rejects.toThrow(ConvexError);
  });
});
