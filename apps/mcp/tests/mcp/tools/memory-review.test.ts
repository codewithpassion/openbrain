import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import { memoryReviewOutputSchema, ThoughtId } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { memoryReviewHandler } from "../../../src/mcp/tools/memory-review";
import { makeAuthContext } from "../../helpers/auth";
import { makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function setup(userId: string) {
  const convex = makeFakeConvex();
  const vectorize = createVectorizeClient(makeFakeVectorize());
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: { deps: { convex, vectorize, embeddings }, auth: makeAuthContext(userId) },
    convex,
  };
}

describe("memory-review tool", () => {
  test("forwards review to Convex with the authenticated user as reviewer", async () => {
    const { envelope, convex } = setup("user_a");
    const result = await memoryReviewHandler(
      { thoughtId: ThoughtId.parse("t_1"), status: "confirmed", promoteTo: "instruction" },
      envelope,
    );
    const out = memoryReviewOutputSchema.parse(result.structuredContent);
    expect(out.status).toBe("confirmed");
    expect(out.trustGrade).toBe("instruction");
    expect(convex.reviewCalls.length).toBe(1);
    expect(convex.reviewCalls[0]?.userId).toBe("user_a");
    expect(convex.reviewCalls[0]?.reviewer).toBe("user_a");
    expect(convex.reviewCalls[0]?.status).toBe("confirmed");
    expect(convex.reviewCalls[0]?.promoteTo).toBe("instruction");
  });

  test("default trustGrade is 'evidence' if no promoteTo given", async () => {
    const { envelope } = setup("u");
    const result = await memoryReviewHandler(
      { thoughtId: ThoughtId.parse("t_2"), status: "unreviewed" },
      envelope,
    );
    const out = memoryReviewOutputSchema.parse(result.structuredContent);
    expect(out.trustGrade).toBe("evidence");
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await memoryReviewHandler(
      { thoughtId: ThoughtId.parse("t_1"), status: "confirmed" },
      envelope,
    );
    expect(result.isError).toBe(true);
  });
});
