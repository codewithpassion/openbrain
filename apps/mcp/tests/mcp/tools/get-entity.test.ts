import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { getEntityOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { getEntityHandler } from "../../../src/mcp/tools/get-entity";
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

describe("get-entity tool", () => {
  test("returns entity + mentions for the authenticated user", async () => {
    const { envelope, convex } = setup("u");
    convex.seedEntity({
      _id: "e_1",
      userId: "u",
      kind: "person",
      canonicalName: "Ada",
      aliases: [],
      metadata: {},
      createdAt: 10,
      updatedAt: 20,
    });
    convex.seedEntityMention({
      _id: "m_1",
      userId: "u",
      entityId: "e_1",
      thoughtId: "t_1",
      createdAt: 30,
    });
    const result = await getEntityHandler({ id: "e_1" }, envelope);
    const out = getEntityOutputSchema.parse(result.structuredContent);
    expect(out.entity?.canonicalName).toBe("Ada");
    expect(out.mentions.map((m) => m.thoughtId)).toEqual(["t_1"]);
  });

  test("returns null entity if not owned by user", async () => {
    const { envelope, convex } = setup("u");
    convex.seedEntity({
      _id: "e_other",
      userId: "u_other",
      kind: "person",
      canonicalName: "X",
      aliases: [],
      metadata: {},
      createdAt: 10,
      updatedAt: 10,
    });
    const result = await getEntityHandler({ id: "e_other" }, envelope);
    const out = getEntityOutputSchema.parse(result.structuredContent);
    expect(out.entity).toBeNull();
    expect(out.mentions).toEqual([]);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await getEntityHandler({ id: "e_1" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("invalid input → isError", async () => {
    const { envelope } = setup("u");
    const result = await getEntityHandler({}, envelope);
    expect(result.isError).toBe(true);
  });
});
