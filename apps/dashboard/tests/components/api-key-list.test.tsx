import { describe, expect, it } from "bun:test";
import { buildApiKeyRowModel, maskRawKey } from "../../src/components/api-key-row-model";

describe("buildApiKeyRowModel", () => {
  const now = Date.UTC(2026, 4, 18, 12, 0, 0);

  it("shows 'never used' when lastUsedAt is missing", () => {
    const model = buildApiKeyRowModel(
      {
        _id: "k1",
        name: "laptop",
        scopes: ["capture", "search"],
        createdAt: now - 60_000,
      },
      now,
    );
    expect(model.lastUsedLabel).toBe("never used");
  });

  it("renders a relative time when lastUsedAt is present", () => {
    const model = buildApiKeyRowModel(
      {
        _id: "k1",
        name: "laptop",
        scopes: ["capture"],
        createdAt: now - 5 * 60_000,
        lastUsedAt: now - 5 * 60_000,
      },
      now,
    );
    expect(model.lastUsedLabel).toBe("5 min ago");
  });

  it("renders the scopes joined by a comma and space", () => {
    const model = buildApiKeyRowModel(
      {
        _id: "k1",
        name: "ci",
        scopes: ["capture", "search", "memory:write"],
        createdAt: now,
      },
      now,
    );
    expect(model.scopesLabel).toBe("capture, search, memory:write");
  });
});

describe("maskRawKey", () => {
  it("preserves the first 4 and last 4 characters and masks the middle", () => {
    expect(maskRawKey("ABCDEFGHIJKLMNOP")).toBe("ABCD••••••••MNOP");
  });

  it("returns the input unchanged when shorter than 8 characters", () => {
    expect(maskRawKey("short")).toBe("short");
  });
});
