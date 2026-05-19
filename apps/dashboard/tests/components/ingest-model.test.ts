import { describe, expect, it } from "bun:test";
import { buildImportRowModels, type ImportLike } from "../../src/components/ingest-model";

const NOW = Date.UTC(2026, 4, 19, 12, 0, 0);

function makeRow(over: Partial<ImportLike>): ImportLike {
  return {
    _id: "i0",
    source: "gmail",
    direction: "import",
    status: "running",
    stats: { processed: 0, created: 0, skipped: 0, errors: 0 },
    updatedAt: NOW - 60_000,
    ...over,
  };
}

describe("buildImportRowModels", () => {
  it("maps status to badge kinds", () => {
    const out = buildImportRowModels(
      [
        makeRow({ status: "success" }),
        makeRow({ _id: "i1", status: "failure" }),
        makeRow({ _id: "i2", status: "cancelled" }),
        makeRow({ _id: "i3", status: "running" }),
      ],
      NOW,
    );
    expect(out.map((r) => r.statusKind)).toEqual(["success", "danger", "warning", "neutral"]);
  });

  it("renders a stats line and relative updated label", () => {
    const [r] = buildImportRowModels(
      [makeRow({ stats: { processed: 10, created: 7, skipped: 2, errors: 1 } })],
      NOW,
    );
    expect(r?.statsLine).toBe("7 created · 2 skipped · 1 errors");
    expect(r?.updatedLabel).toBe("1 min ago");
  });

  it("null-coalesces optional note", () => {
    const [r] = buildImportRowModels([makeRow({ note: undefined })], NOW);
    expect(r?.note).toBe(null);
  });
});
