import { describe, expect, test } from "bun:test";
import {
  listSkillIds,
  loadAllSkills,
  loadSkill,
  SkillNotFoundError,
  skillManifestSchema,
} from "../src";

describe("@openbrains/skills loader", () => {
  test("listSkillIds returns the bundled packs in sorted order, including the core three", async () => {
    const ids = await listSkillIds();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain("research-synthesis");
    expect(ids).toContain("meeting-synthesis");
    expect(ids).toContain("panning-for-gold");
  });

  test("loadSkill returns a parsed manifest and prompt body", async () => {
    const skill = await loadSkill("research-synthesis");
    expect(skill.manifest.name).toBe("research-synthesis");
    expect(skill.manifest.title).toBe("Research Synthesis");
    expect(skill.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(skill.manifest.tags).toContain("research");
    expect(skill.prompt).toContain("Research Synthesis");
    expect(skill.prompt.length).toBeGreaterThan(200);
  });

  test("loadSkill throws SkillNotFoundError for an unknown id", async () => {
    await expect(loadSkill("does-not-exist")).rejects.toBeInstanceOf(SkillNotFoundError);
  });

  test("loadAllSkills returns one entry per directory, all schema-valid", async () => {
    const skills = await loadAllSkills();
    const ids = await listSkillIds();
    expect(skills.length).toBe(ids.length);
    for (const s of skills) {
      const parsed = skillManifestSchema.safeParse(s.manifest);
      expect(parsed.success).toBe(true);
      expect(s.prompt.length).toBeGreaterThan(0);
    }
  });

  test("skillManifestSchema rejects non-semver versions", () => {
    const bad = skillManifestSchema.safeParse({
      name: "foo",
      title: "Foo",
      description: "bar",
      version: "v1",
      tags: [],
    });
    expect(bad.success).toBe(false);
  });

  test("skillManifestSchema rejects non-kebab-case names", () => {
    const bad = skillManifestSchema.safeParse({
      name: "BadName",
      title: "Bad",
      description: "bad",
      version: "0.1.0",
      tags: [],
    });
    expect(bad.success).toBe(false);
  });
});
