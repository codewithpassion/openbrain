import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Skill, skillManifestSchema } from "./types";

const SKILLS_DIR = path.resolve(fileURLToPath(import.meta.url), "..", "..", "skills");

export class SkillNotFoundError extends Error {
  constructor(id: string) {
    super(`Skill not found: ${id}`);
    this.name = "SkillNotFoundError";
  }
}

export async function listSkillIds(): Promise<readonly string[]> {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export async function loadSkill(id: string): Promise<Skill> {
  const dir = path.join(SKILLS_DIR, id);
  let dirStat: Awaited<ReturnType<typeof stat>>;
  try {
    dirStat = await stat(dir);
  } catch {
    throw new SkillNotFoundError(id);
  }
  if (!dirStat.isDirectory()) {
    throw new SkillNotFoundError(id);
  }

  const manifestRaw = await readFile(path.join(dir, "skill.json"), "utf8");
  const manifest = skillManifestSchema.parse(JSON.parse(manifestRaw));
  if (manifest.name !== id) {
    throw new Error(`Skill manifest name "${manifest.name}" does not match directory "${id}"`);
  }

  const prompt = await readFile(path.join(dir, "prompt.md"), "utf8");
  return { manifest, prompt };
}

export async function loadAllSkills(): Promise<readonly Skill[]> {
  const ids = await listSkillIds();
  return await Promise.all(ids.map(loadSkill));
}
