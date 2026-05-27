import {
  type CreateProjectInput,
  type CreateProjectOutput,
  createProjectInputSchema,
  ProjectId,
  ProjectSlug,
} from "@openbrains/shared";
import type { ServiceDeps } from "./deps/index";
import { assertUserId, parseInput } from "./errors";

export async function createProject(
  deps: ServiceDeps,
  userId: string,
  rawInput: unknown,
): Promise<CreateProjectOutput> {
  assertUserId(userId);
  const input: CreateProjectInput = parseInput(createProjectInputSchema, rawInput);
  const { id, slug } = await deps.convex.createProject({
    userId,
    slug: input.slug,
    name: input.name,
    ...(input.description === undefined ? {} : { description: input.description }),
  });
  return {
    projectId: ProjectId.parse(id),
    slug: ProjectSlug.parse(slug),
  };
}
