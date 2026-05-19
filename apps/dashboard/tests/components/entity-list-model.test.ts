import { describe, expect, it } from "bun:test";
import {
  buildEntityRowModels,
  type EntityLike,
  groupByKind,
} from "../../src/components/entity-list-model";

const NOW = Date.UTC(2026, 4, 19, 12, 0, 0);

function makeEntity(over: Partial<EntityLike>): EntityLike {
  return {
    _id: "e0",
    kind: "person",
    canonicalName: "Alice",
    aliases: [],
    updatedAt: NOW - 60_000,
    ...over,
  };
}

describe("buildEntityRowModels", () => {
  it("formats name, kind and a relative updated label", () => {
    const [m] = buildEntityRowModels([makeEntity({})], NOW);
    expect(m?.name).toBe("Alice");
    expect(m?.kind).toBe("person");
    expect(m?.updatedLabel).toBe("1 min ago");
  });

  it("aliasesLine is empty when there are no aliases", () => {
    const [m] = buildEntityRowModels([makeEntity({ aliases: [] })], NOW);
    expect(m?.aliasesLine).toBe("");
  });

  it("aliasesLine caps to 5 with a friendly prefix", () => {
    const [m] = buildEntityRowModels(
      [makeEntity({ aliases: ["a", "b", "c", "d", "e", "f"] })],
      NOW,
    );
    expect(m?.aliasesLine).toBe("also: a, b, c, d, e");
  });
});

describe("groupByKind", () => {
  it("groups rows by kind in alphabetical order", () => {
    const rows = buildEntityRowModels(
      [
        makeEntity({ _id: "e1", kind: "person", canonicalName: "Alice" }),
        makeEntity({ _id: "e2", kind: "org", canonicalName: "Acme" }),
        makeEntity({ _id: "e3", kind: "person", canonicalName: "Bob" }),
      ],
      NOW,
    );
    const groups = groupByKind(rows);
    expect(groups.map((g) => g.kind)).toEqual(["org", "person"]);
    expect(groups[1]?.entities.map((e) => e.name)).toEqual(["Alice", "Bob"]);
  });
});
