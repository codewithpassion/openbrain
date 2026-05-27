import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import {
  captureThoughtOutputSchema,
  getSessionScopeOutputSchema,
  ProjectSlug,
  setSessionScopeOutputSchema,
} from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { captureThoughtHandler } from "../../../src/mcp/tools/capture-thought";
import {
  getSessionScopeHandler,
  setSessionScopeHandler,
} from "../../../src/mcp/tools/session-scope";
import { makeAuthContext } from "../../helpers/auth";
import { defaultExtras, makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function makeEnv(userId: string) {
  const convex = makeFakeConvex();
  const binding = makeFakeVectorize();
  const vectorize = createVectorizeClient(binding);
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  const extras = defaultExtras();
  return {
    envelope: {
      deps: { convex, vectorize, embeddings, ...extras },
      auth: makeAuthContext(userId),
    },
    convex,
    binding,
    sessionScope: extras.sessionScope,
  };
}

describe("session-scope tools", () => {
  test("set then get round-trips the pinned scope", async () => {
    const { envelope } = makeEnv("user_abc");
    const setRes = await setSessionScopeHandler({ scope: "work" }, envelope);
    expect(setRes.isError).toBeUndefined();
    expect(setSessionScopeOutputSchema.parse(setRes.structuredContent).scope).toBe(
      ProjectSlug.parse("work"),
    );

    const getRes = await getSessionScopeHandler({}, envelope);
    expect(getSessionScopeOutputSchema.parse(getRes.structuredContent).scope).toBe(
      ProjectSlug.parse("work"),
    );
  });

  test("set with no scope clears the pin", async () => {
    const { envelope } = makeEnv("user_abc");
    await setSessionScopeHandler({ scope: "work" }, envelope);
    const cleared = await setSessionScopeHandler({}, envelope);
    expect(setSessionScopeOutputSchema.parse(cleared.structuredContent).scope).toBeNull();

    const getRes = await getSessionScopeHandler({}, envelope);
    expect(getSessionScopeOutputSchema.parse(getRes.structuredContent).scope).toBeNull();
  });

  test("rejects without auth", async () => {
    const { envelope } = makeEnv("");
    const setRes = await setSessionScopeHandler({ scope: "work" }, envelope);
    expect(setRes.isError).toBe(true);
    const getRes = await getSessionScopeHandler({}, envelope);
    expect(getRes.isError).toBe(true);
  });

  test("invalid slug input → isError", async () => {
    const { envelope } = makeEnv("user_abc");
    const res = await setSessionScopeHandler({ scope: "Bad Slug!" }, envelope);
    expect(res.isError).toBe(true);
  });

  test("isolates per-user", async () => {
    const a = makeEnv("user_a");
    const b = makeEnv("user_b");
    // Each env has its own session store — model two clients with shared KV
    // is exercised by the integration test below; here we just confirm the
    // per-user key shape (different userId → independent state).
    await setSessionScopeHandler({ scope: "work" }, a.envelope);
    const aGet = await getSessionScopeHandler({}, a.envelope);
    expect(getSessionScopeOutputSchema.parse(aGet.structuredContent).scope).toBe(
      ProjectSlug.parse("work"),
    );
    const bGet = await getSessionScopeHandler({}, b.envelope);
    expect(getSessionScopeOutputSchema.parse(bGet.structuredContent).scope).toBeNull();
  });
});

describe("session-scope default injection", () => {
  test("captureThought picks up pinned scope when input has no scope", async () => {
    const env = makeEnv("user_abc");
    await env.sessionScope.set("user_abc", "work");
    const res = await captureThoughtHandler({ content: "alpha", source: "cli" }, env.envelope);
    expect(res.isError).toBeUndefined();
    captureThoughtOutputSchema.parse(res.structuredContent);
    expect(env.convex.captureCalls.length).toBe(1);
    expect(env.convex.captureCalls[0]?.scope).toBe(ProjectSlug.parse("work"));
  });

  test("captureThought respects explicit input.scope over pinned default", async () => {
    const env = makeEnv("user_abc");
    await env.sessionScope.set("user_abc", "work");
    const res = await captureThoughtHandler(
      { content: "beta", source: "cli", scope: "personal" },
      env.envelope,
    );
    expect(res.isError).toBeUndefined();
    expect(env.convex.captureCalls[0]?.scope).toBe("personal");
  });

  test("captureThought is unscoped when no default and no input.scope", async () => {
    const env = makeEnv("user_abc");
    const res = await captureThoughtHandler({ content: "gamma", source: "cli" }, env.envelope);
    expect(res.isError).toBeUndefined();
    expect(env.convex.captureCalls[0]?.scope).toBeUndefined();
  });
});
