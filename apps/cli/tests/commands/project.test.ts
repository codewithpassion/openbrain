import { describe, expect, test } from "bun:test";
import { ProjectId, ProjectSlug } from "@openbrains/shared";
import {
  applyScopeFlag,
  runProjectCreate,
  runProjectList,
  runProjectUse,
} from "../../src/commands/project";
import { fakeBaseClient } from "../helpers/fake-client";

describe("ob project list", () => {
  test("calls list_projects and returns 0", async () => {
    let called = false;
    const code = await runProjectList({
      flags: {},
      client: {
        ...fakeBaseClient,
        listProjects: () => {
          called = true;
          return Promise.resolve({
            projects: [
              {
                id: ProjectId.parse("p_1"),
                slug: ProjectSlug.parse("work"),
                name: "Work",
                createdAt: 1,
              },
            ],
          });
        },
      },
    });
    expect(code).toBe(0);
    expect(called).toBe(true);
  });

  test("returns 0 with no projects", async () => {
    const code = await runProjectList({ flags: {}, client: fakeBaseClient });
    expect(code).toBe(0);
  });
});

describe("ob project create", () => {
  test("requires slug and name", async () => {
    const code = await runProjectCreate({ args: [], flags: {}, client: fakeBaseClient });
    expect(code).toBe(1);
  });

  test("calls create_project with parsed args", async () => {
    let captured: unknown = null;
    const code = await runProjectCreate({
      args: ["work", "Work", "the day job"],
      flags: {},
      client: {
        ...fakeBaseClient,
        createProject: (input) => {
          captured = input;
          return Promise.resolve({
            projectId: ProjectId.parse("p_new"),
            slug: ProjectSlug.parse("work"),
          });
        },
      },
    });
    expect(code).toBe(0);
    expect(captured).toEqual({ slug: "work", name: "Work", description: "the day job" });
  });
});

describe("ob project use", () => {
  test("--clear removes active project and returns 0", async () => {
    const writes: { active?: string | undefined }[] = [];
    const code = await runProjectUse({
      args: [],
      flags: { clear: true },
      client: fakeBaseClient,
      writeActive: (active) => {
        writes.push({ active });
        return Promise.resolve();
      },
      readActive: () => undefined,
    });
    expect(code).toBe(0);
    expect(writes).toEqual([{ active: undefined }]);
  });

  test("with slug validates against list_projects then writes", async () => {
    const writes: { active?: string | undefined }[] = [];
    const code = await runProjectUse({
      args: ["work"],
      flags: {},
      client: {
        ...fakeBaseClient,
        listProjects: () =>
          Promise.resolve({
            projects: [
              {
                id: ProjectId.parse("p_1"),
                slug: ProjectSlug.parse("work"),
                name: "Work",
                createdAt: 1,
              },
            ],
          }),
      },
      writeActive: (active) => {
        writes.push({ active });
        return Promise.resolve();
      },
      readActive: () => undefined,
    });
    expect(code).toBe(0);
    expect(writes).toEqual([{ active: "work" }]);
  });

  test("rejects unknown slug without writing", async () => {
    const writes: string[] = [];
    const code = await runProjectUse({
      args: ["unknown"],
      flags: {},
      client: {
        ...fakeBaseClient,
        listProjects: () => Promise.resolve({ projects: [] }),
      },
      writeActive: (active) => {
        writes.push(active ?? "<clear>");
        return Promise.resolve();
      },
      readActive: () => undefined,
    });
    expect(code).toBe(1);
    expect(writes).toEqual([]);
  });

  test("with no args prints active project (none)", async () => {
    const code = await runProjectUse({
      args: [],
      flags: {},
      client: fakeBaseClient,
      writeActive: () => Promise.resolve(),
      readActive: () => undefined,
    });
    expect(code).toBe(0);
  });
});

describe("applyScopeFlag", () => {
  test("--scope=<slug> overrides active", () => {
    expect(applyScopeFlag({ scope: "work" }, "personal")).toBe("work");
  });
  test("no flag falls back to active", () => {
    expect(applyScopeFlag({}, "personal")).toBe("personal");
  });
  test("no flag and no active returns undefined", () => {
    expect(applyScopeFlag({}, undefined)).toBeUndefined();
  });
  test("--no-scope clears", () => {
    expect(applyScopeFlag({ "no-scope": true }, "personal")).toBeUndefined();
  });
  test("invalid slug throws", () => {
    expect(() => applyScopeFlag({ scope: "Invalid Slug!" }, undefined)).toThrow();
  });
});
