import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { listEntitiesOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { listEntitiesHandler } from "../../../src/mcp/tools/list-entities";
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

describe("list-entities tool", () => {
  test("returns entities for the authenticated user", async () => {
    const { envelope, convex } = setup("u_1");
    convex.seedEntity({
      _id: "e_a",
      userId: "u_1",
      kind: "person",
      canonicalName: "Ada Lovelace",
      aliases: ["Ada"],
      metadata: {},
      createdAt: 1000,
      updatedAt: 2000,
    });
    convex.seedEntity({
      _id: "e_b",
      userId: "u_other",
      kind: "person",
      canonicalName: "Other",
      aliases: [],
      metadata: {},
      createdAt: 1000,
      updatedAt: 3000,
    });
    const result = await listEntitiesHandler({}, envelope);
    const out = listEntitiesOutputSchema.parse(result.structuredContent);
    expect(out.entities.length).toBe(1);
    expect(out.entities[0]?.canonicalName).toBe("Ada Lovelace");
  });

  test("filters by kind", async () => {
    const { envelope, convex } = setup("u");
    convex.seedEntity({
      _id: "e_p",
      userId: "u",
      kind: "person",
      canonicalName: "P",
      aliases: [],
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
    });
    convex.seedEntity({
      _id: "e_o",
      userId: "u",
      kind: "org",
      canonicalName: "O",
      aliases: [],
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
    });
    const result = await listEntitiesHandler({ kind: "org" }, envelope);
    const out = listEntitiesOutputSchema.parse(result.structuredContent);
    expect(out.entities.map((e) => e.canonicalName)).toEqual(["O"]);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await listEntitiesHandler({}, envelope);
    expect(result.isError).toBe(true);
  });

  test("invalid input → isError", async () => {
    const { envelope } = setup("u");
    const result = await listEntitiesHandler({ limit: 0 }, envelope);
    expect(result.isError).toBe(true);
  });
});
