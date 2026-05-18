import { describe, expect, test } from "bun:test";
import { createVectorizeClient } from "../../src/deps/vectorize";
import { makeFakeVectorize } from "../helpers/fakes";

describe("createVectorizeClient", () => {
  test("upsert sets namespace=userId and source metadata", async () => {
    const binding = makeFakeVectorize();
    const client = createVectorizeClient(binding);
    await client.upsert({
      id: "thought_1",
      userId: "user_abc",
      values: [0.1, 0.2, 0.3],
      metadata: { source: "cli", type: "task" },
    });
    expect(binding.upsertCalls.length).toBe(1);
    const call = binding.upsertCalls[0];
    expect(call?.namespace).toBe("user_abc");
    expect(call?.id).toBe("thought_1");
    expect(call?.metadata).toEqual({ source: "cli", type: "task" });
  });

  test("upsert omits type when not supplied", async () => {
    const binding = makeFakeVectorize();
    const client = createVectorizeClient(binding);
    await client.upsert({
      id: "thought_2",
      userId: "user_x",
      values: [0],
      metadata: { source: "dashboard" },
    });
    expect(binding.upsertCalls[0]?.metadata).toEqual({ source: "dashboard" });
  });

  test("query sets namespace=userId and forwards topK", async () => {
    const binding = makeFakeVectorize();
    binding.setMatches([
      { id: "a", score: 0.9 },
      { id: "b", score: 0.7 },
    ]);
    const client = createVectorizeClient(binding);
    const out = await client.query({
      userId: "user_zzz",
      values: [0.5],
      topK: 5,
    });
    expect(binding.queryCalls[0]?.namespace).toBe("user_zzz");
    expect(binding.queryCalls[0]?.topK).toBe(5);
    expect(binding.queryCalls[0]?.filter).toBeUndefined();
    expect(out).toEqual([
      { id: "a", score: 0.9 },
      { id: "b", score: 0.7 },
    ]);
  });

  test("query forwards type and source metadata filters", async () => {
    const binding = makeFakeVectorize();
    binding.setMatches([]);
    const client = createVectorizeClient(binding);
    await client.query({
      userId: "u",
      values: [0],
      topK: 10,
      metadata: { type: "idea", source: "cli" },
    });
    expect(binding.queryCalls[0]?.filter).toEqual({ type: "idea", source: "cli" });
  });

  test("delete forwards id only", async () => {
    const binding = makeFakeVectorize();
    const client = createVectorizeClient(binding);
    await client.delete({ id: "thought_99" });
    expect(binding.deleteCalls[0]?.ids).toEqual(["thought_99"]);
  });
});
