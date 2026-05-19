import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { entityRelationsOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { entityRelationsHandler } from "../../../src/mcp/tools/entity-relations";
import { makeAuthContext } from "../../helpers/auth";
import { defaultExtras, makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function setup(userId: string) {
  const convex = makeFakeConvex();
  const vectorize = createVectorizeClient(makeFakeVectorize());
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: {
      deps: { convex, vectorize, embeddings, ...defaultExtras() },
      auth: makeAuthContext(userId),
    },
    convex,
  };
}

describe("entity-relations tool", () => {
  test("returns outgoing + incoming relations", async () => {
    const { envelope, convex } = setup("u");
    convex.seedEntity({
      _id: "e_1",
      userId: "u",
      kind: "person",
      canonicalName: "A",
      aliases: [],
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
    });
    convex.seedEntityRelation({
      _id: "r_out",
      userId: "u",
      fromEntityId: "e_1",
      toEntityId: "e_2",
      kind: "works_with",
      evidenceThoughtIds: ["t_a"],
      confidence: 0.8,
      createdAt: 1,
      updatedAt: 5,
    });
    convex.seedEntityRelation({
      _id: "r_in",
      userId: "u",
      fromEntityId: "e_3",
      toEntityId: "e_1",
      kind: "manages",
      evidenceThoughtIds: ["t_b"],
      confidence: 0.6,
      createdAt: 1,
      updatedAt: 4,
    });
    const result = await entityRelationsHandler({ entityId: "e_1" }, envelope);
    const out = entityRelationsOutputSchema.parse(result.structuredContent);
    expect(out.outgoing.map((r) => r.kind)).toEqual(["works_with"]);
    expect(out.incoming.map((r) => r.kind)).toEqual(["manages"]);
  });

  test("returns empty if entity isn't owned by user", async () => {
    const { envelope, convex } = setup("u");
    convex.seedEntity({
      _id: "e_x",
      userId: "u_other",
      kind: "person",
      canonicalName: "X",
      aliases: [],
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
    });
    const result = await entityRelationsHandler({ entityId: "e_x" }, envelope);
    const out = entityRelationsOutputSchema.parse(result.structuredContent);
    expect(out.outgoing).toEqual([]);
    expect(out.incoming).toEqual([]);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await entityRelationsHandler({ entityId: "e_1" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("invalid input → isError", async () => {
    const { envelope } = setup("u");
    const result = await entityRelationsHandler({}, envelope);
    expect(result.isError).toBe(true);
  });
});
