import { describe, expect, test } from "bun:test";
import { ServiceAuthError, thoughtStats } from "../src/index";
import { makeFakeDeps } from "./helpers/fakes";

describe("thoughtStats service", () => {
  test("maps Convex topPeople[name] to output topPeople[person]", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    convex.seedStats("user_a", {
      total: 3,
      byType: { task: 2, idea: 1 },
      topTopics: [{ topic: "alpha", count: 2 }],
      topPeople: [{ name: "Alice", count: 1 }],
    });
    const out = await thoughtStats({ convex, vectorize, embeddings }, "user_a", {});
    expect(out.total).toBe(3);
    expect(out.topPeople[0]?.person).toBe("Alice");
    expect(out.byType).toEqual({ task: 2, idea: 1 });
  });

  test("missing userId throws ServiceAuthError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(thoughtStats({ convex, vectorize, embeddings }, "", {})).rejects.toBeInstanceOf(
      ServiceAuthError,
    );
  });
});
