import { describe, expect, it } from "bun:test";
import { buildThoughtCardModel, filterThoughts } from "../../src/components/thought-card-model";

const sampleThought = {
  _id: "t1",
  userId: "u1",
  content: "Need to read more about Cloudflare Workers. Also Workers AI embeddings.",
  source: "dashboard",
  embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
  embeddingDims: 1024,
  fingerprint: "0".repeat(64),
  metadata: {
    type: "idea",
    topics: ["workers", "ai"],
    people: [],
    action_items: [],
    dates_mentioned: [],
  },
  createdAt: Date.UTC(2026, 4, 18, 11, 0, 0),
  updatedAt: Date.UTC(2026, 4, 18, 11, 0, 0),
};

describe("buildThoughtCardModel", () => {
  it("derives a short relative timestamp from the createdAt millis", () => {
    const now = Date.UTC(2026, 4, 18, 12, 0, 0);
    const model = buildThoughtCardModel(sampleThought, now);
    expect(model.relativeTime).toBe("1 hr ago");
  });

  it("returns the topics joined by the bullet separator", () => {
    const now = Date.UTC(2026, 4, 18, 12, 0, 0);
    const model = buildThoughtCardModel(sampleThought, now);
    expect(model.topicsLine).toBe("workers · ai");
  });

  it("falls back to 'thought' as the type label when type is undefined", () => {
    const withoutType = {
      ...sampleThought,
      metadata: { ...sampleThought.metadata, type: undefined },
    };
    const model = buildThoughtCardModel(withoutType, Date.UTC(2026, 4, 18, 12, 0, 0));
    expect(model.typeLabel).toBe("thought");
  });
});

describe("filterThoughts", () => {
  const items = [
    { ...sampleThought, _id: "a", content: "Notes on workers ai" },
    { ...sampleThought, _id: "b", content: "Personal journal entry about gardening" },
    {
      ...sampleThought,
      _id: "c",
      content: "Cloudflare deployment plan",
      metadata: { ...sampleThought.metadata, topics: ["deployment"] },
    },
  ];

  it("returns every thought when the query is empty", () => {
    expect(filterThoughts(items, "")).toHaveLength(3);
  });

  it("matches on content substring case-insensitively", () => {
    expect(filterThoughts(items, "CLOUDFLARE").map((t) => t._id)).toEqual(["c"]);
  });

  it("matches on a topic in the metadata", () => {
    expect(filterThoughts(items, "deployment").map((t) => t._id)).toEqual(["c"]);
  });

  it("returns the empty array when nothing matches", () => {
    expect(filterThoughts(items, "kubernetes")).toEqual([]);
  });
});
