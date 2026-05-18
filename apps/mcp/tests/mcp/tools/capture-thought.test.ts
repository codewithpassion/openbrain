import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { captureThoughtOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { captureThoughtHandler } from "../../../src/mcp/tools/capture-thought";
import { makeAuthContext } from "../../helpers/auth";
import { makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function makeEnvelope(userId: string) {
  const convex = makeFakeConvex();
  const binding = makeFakeVectorize();
  const vectorize = createVectorizeClient(binding);
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: {
      deps: { convex, vectorize, embeddings },
      auth: makeAuthContext(userId),
    },
    convex,
    binding,
  };
}

describe("capture-thought tool", () => {
  test("captures, embeds, upserts to vectorize with namespace=userId", async () => {
    const { envelope, convex, binding } = makeEnvelope("user_abc");
    const result = await captureThoughtHandler(
      { content: "the quick brown fox", source: "cli" },
      envelope,
    );
    expect(result.isError).toBeUndefined();
    const parsed = captureThoughtOutputSchema.parse(result.structuredContent);
    expect(parsed.duplicate).toBe(false);
    expect(typeof parsed.thoughtId).toBe("string");

    expect(convex.captureCalls.length).toBe(1);
    const cap = convex.captureCalls[0];
    expect(cap?.userId).toBe("user_abc");
    expect(cap?.source).toBe("cli");
    expect(cap?.embeddingDims).toBe(1024);
    expect(cap?.fingerprint.length).toBe(64);

    expect(binding.upsertCalls.length).toBe(1);
    expect(binding.upsertCalls[0]?.namespace).toBe("user_abc");
    expect(binding.upsertCalls[0]?.id).toBe(parsed.thoughtId);
  });

  test("idempotent: same content twice returns the existing id and skips vectorize.upsert", async () => {
    const { envelope, convex, binding } = makeEnvelope("user_abc");
    const first = await captureThoughtHandler({ content: "dedupe me", source: "cli" }, envelope);
    const second = await captureThoughtHandler({ content: "dedupe me", source: "cli" }, envelope);
    const a = captureThoughtOutputSchema.parse(first.structuredContent);
    const b = captureThoughtOutputSchema.parse(second.structuredContent);
    expect(b.thoughtId).toBe(a.thoughtId);
    expect(b.duplicate).toBe(true);

    expect(convex.captureCalls.length).toBe(1); // second call short-circuited
    expect(binding.upsertCalls.length).toBe(1);
  });

  test("returns isError for invalid input (empty content)", async () => {
    const { envelope } = makeEnvelope("u");
    const result = await captureThoughtHandler({ content: "", source: "cli" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("refuses to run without an auth context userId", async () => {
    const { envelope } = makeEnvelope("");
    const result = await captureThoughtHandler({ content: "x", source: "cli" }, envelope);
    expect(result.isError).toBe(true);
  });
});
