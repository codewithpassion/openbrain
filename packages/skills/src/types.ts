import { z } from "zod";

/**
 * On-disk shape of `packages/skills/skills/<id>/skill.json`. Mirrors OB1's
 * skill-pack convention but trimmed to what we use today.
 */
export const skillManifestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "name must be kebab-case"),
    title: z.string().min(1),
    description: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver MAJOR.MINOR.PATCH"),
    tags: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export interface Skill {
  readonly manifest: SkillManifest;
  readonly prompt: string;
}
