import { describe, expect, test } from "bun:test";
import { ThoughtId } from "@openbrains/shared";
import { memoryReview, ReviewRequiresConfirmedError, ServiceAuthError } from "../src/index";
import { makeFakeDeps } from "./helpers/fakes";

const ID = ThoughtId.parse("t_1");

describe("memoryReview service", () => {
  test("promotion to instruction sets trustGrade='instruction' when server confirms", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    const out = await memoryReview({ convex, vectorize, embeddings }, "user_a", {
      thoughtId: ID,
      status: "confirmed",
      promoteTo: "instruction",
    });
    expect(out.trustGrade).toBe("instruction");
  });

  test("server REQUIRES_REVIEW maps to ReviewRequiresConfirmedError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    convex.setReviewResponse("REQUIRES_REVIEW");
    await expect(
      memoryReview({ convex, vectorize, embeddings }, "user_a", {
        thoughtId: ID,
        status: "unreviewed",
        promoteTo: "instruction",
      }),
    ).rejects.toBeInstanceOf(ReviewRequiresConfirmedError);
  });

  test("missing userId throws ServiceAuthError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      memoryReview({ convex, vectorize, embeddings }, "", {
        thoughtId: ID,
        status: "confirmed",
      }),
    ).rejects.toBeInstanceOf(ServiceAuthError);
  });
});
