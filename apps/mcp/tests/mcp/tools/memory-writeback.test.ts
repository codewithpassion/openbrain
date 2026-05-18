import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { memoryWritebackOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { memoryWritebackHandler } from "../../../src/mcp/tools/memory-writeback";
import { makeAuthContext } from "../../helpers/auth";
import { makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function setup(userId: string) {
  const convex = makeFakeConvex();
  const binding = makeFakeVectorize();
  const vectorize = createVectorizeClient(binding);
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: { deps: { convex, vectorize, embeddings }, auth: makeAuthContext(userId) },
    convex,
    binding,
  };
}

describe("memory-writeback tool", () => {
  test("default trustGrade is 'evidence' and origin is forwarded", async () => {
    const { envelope, convex, binding } = setup("user_a");
    const result = await memoryWritebackHandler(
      {
        content: "the agent thinks x",
        source: "agent",
        origin: "agent_inferred",
        agent: "claude",
      },
      envelope,
    );
    const out = memoryWritebackOutputSchema.parse(result.structuredContent);
    expect(out.trustGrade).toBe("evidence");
    expect(convex.writebackCalls.length).toBe(1);
    const wb = convex.writebackCalls[0];
    expect(wb?.userId).toBe("user_a");
    expect(wb?.origin).toBe("agent_inferred");
    expect(wb?.trustGrade).toBe("evidence");
    expect(wb?.agent).toBe("claude");
    expect(binding.upsertCalls.length).toBe(1);
    expect(binding.upsertCalls[0]?.namespace).toBe("user_a");
  });

  test("explicit trustGrade='draft' is honored", async () => {
    const { envelope } = setup("u");
    const result = await memoryWritebackHandler(
      { content: "x", source: "agent", origin: "agent_inferred", trustGrade: "draft" },
      envelope,
    );
    const out = memoryWritebackOutputSchema.parse(result.structuredContent);
    expect(out.trustGrade).toBe("draft");
  });

  test("rejects callers attempting to write trustGrade='instruction'", async () => {
    const { envelope } = setup("u");
    // The shared zod schema already rejects "instruction" via WritebackTrustGrade.
    // Use a raw object that bypasses TS to verify the runtime defence.
    const raw: unknown = {
      content: "x",
      source: "agent",
      origin: "agent_inferred",
      trustGrade: "instruction",
    };
    const result = await memoryWritebackHandler(raw, envelope);
    expect(result.isError).toBe(true);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await memoryWritebackHandler(
      { content: "x", source: "agent", origin: "agent_inferred" },
      envelope,
    );
    expect(result.isError).toBe(true);
  });
});
