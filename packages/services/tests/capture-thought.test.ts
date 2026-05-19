import { describe, expect, test } from "bun:test";
import { captureThought, ServiceAuthError } from "../src/index";
import { makeFakeDeps } from "./helpers/fakes";

describe("captureThought service", () => {
  test("captures content, embeds, upserts to vectorize with namespace=userId", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    const out = await captureThought({ convex, vectorize, embeddings }, "user_a", {
      content: "alpha thought",
      source: "cli",
    });
    expect(out.duplicate).toBe(false);
    expect(out.thoughtId).toBeTruthy();
    expect(convex.captureCalls.length).toBe(1);
    expect(binding.upsertCalls[0]?.namespace).toBe("user_a");
    expect(binding.upsertCalls[0]?.id).toBe(out.thoughtId);
  });

  test("idempotent: same fingerprint returns existing id, no vectorize.upsert", async () => {
    const { convex, binding, vectorize, embeddings } = makeFakeDeps();
    const first = await captureThought({ convex, vectorize, embeddings }, "user_a", {
      content: "x",
      source: "cli",
    });
    const second = await captureThought({ convex, vectorize, embeddings }, "user_a", {
      content: "x",
      source: "cli",
    });
    expect(second.duplicate).toBe(true);
    expect(second.thoughtId).toBe(first.thoughtId);
    expect(binding.upsertCalls.length).toBe(1);
  });

  test("missing userId throws ServiceAuthError", async () => {
    const { convex, vectorize, embeddings } = makeFakeDeps();
    await expect(
      captureThought({ convex, vectorize, embeddings }, "", { content: "x", source: "cli" }),
    ).rejects.toBeInstanceOf(ServiceAuthError);
  });
});
