import { describe, expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import { makeTest, TEST_USER_A } from "./helpers/client";
import { makeThought } from "./helpers/fixtures";

async function seedThought(t: ReturnType<typeof makeTest>, userId: string) {
  const fx = makeThought(userId);
  return await t.withIdentity({ subject: userId }).mutation(api.thoughts.createThought, {
    content: fx.content,
    source: fx.source,
    embeddingModel: fx.embeddingModel,
    embeddingDims: fx.embeddingDims,
    fingerprint: fx.fingerprint,
    metadata: fx.metadata,
  });
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    process.env[key] = value;
  }
}

describe("entitiesAction.extractFromThoughtInternal", () => {
  test("skips when DASHBOARD_WORKER_URL is unset", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const prior = process.env["DASHBOARD_WORKER_URL"];
    setEnv("DASHBOARD_WORKER_URL", undefined);
    try {
      const out = await t.action(internal.entitiesAction.extractFromThoughtInternal, {
        userId: TEST_USER_A,
        thoughtId: id,
        content: "hi",
      });
      expect(out.status).toBe("skipped");
    } finally {
      setEnv("DASHBOARD_WORKER_URL", prior);
    }
  });

  test("skips when INTERNAL_API_SECRET is unset", async () => {
    const t = makeTest();
    const id = await seedThought(t, TEST_USER_A);
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const priorUrl = process.env["DASHBOARD_WORKER_URL"];
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    const priorSecret = process.env["INTERNAL_API_SECRET"];
    setEnv("DASHBOARD_WORKER_URL", "https://ob-dash.example.com");
    setEnv("INTERNAL_API_SECRET", undefined);
    try {
      const out = await t.action(internal.entitiesAction.extractFromThoughtInternal, {
        userId: TEST_USER_A,
        thoughtId: id,
        content: "hi",
      });
      expect(out.status).toBe("skipped");
    } finally {
      setEnv("DASHBOARD_WORKER_URL", priorUrl);
      setEnv("INTERNAL_API_SECRET", priorSecret);
    }
  });
});
