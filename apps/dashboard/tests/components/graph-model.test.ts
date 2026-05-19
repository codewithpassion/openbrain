import { describe, expect, it } from "bun:test";
import {
  buildGraphModel,
  colorForKind,
  type EntityNodeInput,
  type RelationEdgeInput,
} from "../../src/components/graph-model";

function entity(over: Partial<EntityNodeInput>): EntityNodeInput {
  return {
    _id: "e0",
    kind: "person",
    canonicalName: "Alice",
    aliases: [],
    updatedAt: 1,
    ...over,
  };
}

function relation(over: Partial<RelationEdgeInput>): RelationEdgeInput {
  return {
    _id: "r0",
    fromEntityId: "e0",
    toEntityId: "e1",
    kind: "knows",
    evidenceThoughtIds: [],
    confidence: 0.5,
    updatedAt: 1,
    ...over,
  };
}

describe("buildGraphModel", () => {
  it("emits one node per entity with kind-derived color", () => {
    const model = buildGraphModel({
      entities: [
        entity({ _id: "e0", canonicalName: "Alice", kind: "person" }),
        entity({ _id: "e1", canonicalName: "Acme", kind: "org" }),
      ],
      relations: [],
    });
    expect(model.nodes.length).toBe(2);
    expect(model.nodes[0]?.label).toBe("Alice");
    expect(model.nodes[0]?.color).toBe(colorForKind("person"));
    expect(model.nodes[1]?.color).toBe(colorForKind("org"));
  });

  it("emits one link per relation, both directions captured separately", () => {
    const model = buildGraphModel({
      entities: [entity({ _id: "e0" }), entity({ _id: "e1" })],
      relations: [relation({ _id: "r1", fromEntityId: "e0", toEntityId: "e1", kind: "knows" })],
    });
    expect(model.links.length).toBe(1);
    expect(model.links[0]?.source).toBe("e0");
    expect(model.links[0]?.target).toBe("e1");
    expect(model.links[0]?.label).toBe("knows");
  });

  it("drops relations whose endpoints are not in the node set", () => {
    const model = buildGraphModel({
      entities: [entity({ _id: "e0" })],
      relations: [
        relation({ _id: "r1", fromEntityId: "e0", toEntityId: "missing" }),
        relation({ _id: "r2", fromEntityId: "ghost", toEntityId: "e0" }),
      ],
    });
    expect(model.links).toEqual([]);
  });

  it("dedupes nodes that appear in both entities and relations", () => {
    const model = buildGraphModel({
      entities: [entity({ _id: "e0" }), entity({ _id: "e0" })],
      relations: [],
    });
    expect(model.nodes.length).toBe(1);
  });

  it("colorForKind is stable across calls and distinct per kind", () => {
    expect(colorForKind("person")).toBe(colorForKind("person"));
    expect(colorForKind("person")).not.toBe(colorForKind("org"));
  });
});
