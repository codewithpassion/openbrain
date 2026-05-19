import { describe, expect, test } from "bun:test";
import { memoryWriteback, ServiceAuthError } from "../src/index";
import { makeFakeDeps } from "./helpers/fakes";

describe("memoryWriteback service", () => {
  test("writes a new thought and upserts to vectorize with namespace=userId", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    const out = await memoryWriteback({ convex, vectorize, embeddings }, "user_a", {
      content: "inferred",
      source: "agent",
      origin: "agent_inferred",
      trustGrade: "evidence",
      scopes: [],
    });
    expect(convex.writebackCalls.length).toBe(1);
    expect(binding.upsertCalls[0]?.namespace).toBe("user_a");
    expect(binding.upsertCalls[0]?.id).toBe(out.thoughtId);
    expect(out.trustGrade).toBe("evidence");
  });

  test("missing userId throws ServiceAuthError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      memoryWriteback({ convex, vectorize, embeddings }, "", {
        content: "x",
        source: "agent",
        origin: "agent_inferred",
        trustGrade: "evidence",
        scopes: [],
      }),
    ).rejects.toBeInstanceOf(ServiceAuthError);
  });
});
