import { describe, expect, it } from "bun:test";
import { buildDigestRowModels, type DigestLike } from "../../src/components/digest-list-model";

const NOW = Date.UTC(2026, 4, 19, 12, 0, 0);

const sample: DigestLike = {
  _id: "d1",
  date: "2026-05-18",
  summary: "- went deep on workers ai\n- sketched a new pipeline",
  thoughtCount: 7,
  generator: "workers-ai:@cf/meta/llama-3.1-8b-instruct",
  generatedAt: NOW - 5 * 60_000,
};

describe("buildDigestRowModels", () => {
  it("pluralizes the thought count", () => {
    const [a, b] = buildDigestRowModels([sample, { ...sample, _id: "d2", thoughtCount: 1 }], NOW);
    expect(a?.countLabel).toBe("7 thoughts");
    expect(b?.countLabel).toBe("1 thought");
  });

  it("renders a relative generated-at label", () => {
    const [a] = buildDigestRowModels([sample], NOW);
    expect(a?.generatedLabel).toBe("5 min ago");
  });

  it("preserves the date and summary verbatim", () => {
    const [a] = buildDigestRowModels([sample], NOW);
    expect(a?.date).toBe("2026-05-18");
    expect(a?.summary).toContain("workers ai");
  });
});
