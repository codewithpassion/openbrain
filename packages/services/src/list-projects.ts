import { type ListProjectsOutput, ProjectId, ProjectSlug, projectSchema } from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId } from "./errors";

export async function listProjects(deps: ServiceDeps, userId: string): Promise<ListProjectsOutput> {
  assertUserId(userId);
  const rows = await deps.convex.listProjects({ userId });
  const projects = rows.map((r) =>
    projectSchema.parse({
      id: ProjectId.parse(r._id),
      slug: ProjectSlug.parse(r.slug),
      name: r.name,
      ...(r.description === undefined ? {} : { description: r.description }),
      createdAt: r.createdAt,
    }),
  );
  return { projects };
}
