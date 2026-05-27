import { ProjectSlug } from "@openbrains/shared";
import { type Flags, flagBoolean, flagString } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitError, emitJson, isJsonFlag } from "../output";

export interface ProjectListOptions {
  client: McpClientLike;
  flags: Flags;
}

export async function runProjectList(opts: ProjectListOptions): Promise<number> {
  const result = await opts.client.listProjects();
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  if (result.projects.length === 0) {
    emit("No projects.");
    return 0;
  }
  for (const p of result.projects) {
    emit(`${p.slug}\t${p.name}`);
  }
  return 0;
}

export interface ProjectCreateOptions {
  args: readonly string[];
  client: McpClientLike;
  flags: Flags;
}

export async function runProjectCreate(opts: ProjectCreateOptions): Promise<number> {
  const slug = opts.args[0];
  const name = opts.args[1];
  if (slug === undefined || name === undefined) {
    emitError("usage: ob project create <slug> <name> [description...]");
    return 1;
  }
  const description = opts.args.slice(2).join(" ");
  const parsed = ProjectSlug.safeParse(slug);
  if (!parsed.success) {
    emitError(`invalid slug: ${parsed.error.issues[0]?.message ?? "must be slug-shaped"}`);
    return 1;
  }
  const result = await opts.client.createProject({
    slug: parsed.data,
    name,
    ...(description.length === 0 ? {} : { description }),
  });
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
  } else {
    emit(`Created ${result.slug} (${result.projectId})`);
  }
  return 0;
}

export interface ProjectUseOptions {
  args: readonly string[];
  client: McpClientLike;
  flags: Flags;
  writeActive(active: string | undefined): Promise<void>;
  readActive(): string | undefined;
}

export async function runProjectUse(opts: ProjectUseOptions): Promise<number> {
  if (flagBoolean(opts.flags, "clear")) {
    await opts.writeActive(undefined);
    emit("Cleared active project.");
    return 0;
  }
  const target = opts.args[0];
  if (target === undefined) {
    const active = opts.readActive();
    emit(active === undefined ? "(no active project)" : active);
    return 0;
  }
  const parsed = ProjectSlug.safeParse(target);
  if (!parsed.success) {
    emitError(`invalid slug: ${parsed.error.issues[0]?.message ?? "must be slug-shaped"}`);
    return 1;
  }
  const { projects } = await opts.client.listProjects();
  if (!projects.some((p) => p.slug === parsed.data)) {
    emitError(`unknown project: ${target}`);
    return 1;
  }
  await opts.writeActive(parsed.data);
  emit(`Active project: ${parsed.data}`);
  return 0;
}

/**
 * Resolve the project scope for a given command run.
 *
 * Precedence (highest first):
 *   1. `--no-scope` — explicit unscoped (overrides everything).
 *   2. `--scope=<slug>` — explicit override.
 *   3. The pinned `activeProject` from credentials.
 *   4. undefined.
 *
 * Throws if `--scope=<slug>` parses as an invalid slug — typo protection at
 * the CLI boundary; the Convex layer would reject it too, but failing early
 * gives a clearer error.
 */
export function applyScopeFlag(flags: Flags, active: string | undefined): string | undefined {
  if (flagBoolean(flags, "no-scope")) {
    return undefined;
  }
  const explicit = flagString(flags, "scope");
  if (explicit !== undefined) {
    const parsed = ProjectSlug.parse(explicit);
    return parsed;
  }
  return active;
}
