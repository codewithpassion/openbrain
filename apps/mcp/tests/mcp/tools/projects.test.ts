import { describe, expect, test } from "bun:test";
import { createFakeEmbedder } from "@openbrains/ingest";
import {
  captureThoughtOutputSchema,
  createProjectOutputSchema,
  listProjectsOutputSchema,
} from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { captureThoughtHandler } from "../../../src/mcp/tools/capture-thought";
import { createProjectHandler } from "../../../src/mcp/tools/create-project";
import { listProjectsHandler } from "../../../src/mcp/tools/list-projects";
import { makeAuthContext } from "../../helpers/auth";
import { defaultExtras, makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function makeEnvelope(userId: string) {
  const convex = makeFakeConvex();
  const binding = makeFakeVectorize();
  const vectorize = createVectorizeClient(binding);
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: {
      deps: { convex, vectorize, embeddings, ...defaultExtras() },
      auth: makeAuthContext(userId),
    },
    convex,
    binding,
  };
}

describe("projects tools", () => {
  test("create_project then list_projects returns the new project", async () => {
    const { envelope } = makeEnvelope("user_a");
    const created = await createProjectHandler({ slug: "work", name: "Work" }, envelope);
    const createdParsed = createProjectOutputSchema.parse(created.structuredContent);
    expect(createdParsed.slug as string).toBe("work");
    const listed = await listProjectsHandler({}, envelope);
    const listedParsed = listProjectsOutputSchema.parse(listed.structuredContent);
    expect(listedParsed.projects).toHaveLength(1);
    expect(listedParsed.projects[0]?.slug as string).toBe("work");
  });

  test("create_project rejects an invalid slug at the input schema layer", async () => {
    const { envelope } = makeEnvelope("user_a");
    const result = await createProjectHandler({ slug: "Has Space", name: "x" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("create_project surfaces SLUG_TAKEN as isError when called twice", async () => {
    const { envelope } = makeEnvelope("user_a");
    await createProjectHandler({ slug: "work", name: "Work" }, envelope);
    const dup = await createProjectHandler({ slug: "work", name: "Work" }, envelope);
    expect(dup.isError).toBe(true);
  });

  test("list_projects scoped to the calling user", async () => {
    const { envelope: aEnv, convex } = makeEnvelope("user_a");
    await createProjectHandler({ slug: "work", name: "Work" }, aEnv);
    // Reuse the same fake convex across two callers — second envelope uses different userId
    const bEnv = {
      envelope: {
        deps: aEnv.deps, // share state
        auth: makeAuthContext("user_b"),
      },
      convex,
    };
    const listedB = await listProjectsHandler({}, bEnv.envelope);
    const parsedB = listProjectsOutputSchema.parse(listedB.structuredContent);
    expect(parsedB.projects).toHaveLength(0);
  });

  test("capture_thought with scope sends the scope through to convex", async () => {
    const { envelope, convex } = makeEnvelope("user_a");
    convex.seedProject({
      _id: "p_1",
      userId: "user_a",
      slug: "work",
      name: "Work",
      createdAt: Date.now(),
    });
    const result = await captureThoughtHandler(
      { content: "scoped note", source: "cli", scope: "work" },
      envelope,
    );
    expect(result.isError).toBeUndefined();
    captureThoughtOutputSchema.parse(result.structuredContent);
    expect(convex.captureCalls.length).toBe(1);
    expect(convex.captureCalls[0]?.scope).toBe("work");
  });
});
