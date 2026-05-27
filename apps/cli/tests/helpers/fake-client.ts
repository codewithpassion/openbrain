import { ProjectId, ProjectSlug, ThoughtId } from "@openbrains/shared";
import type { McpClientLike } from "../../src/mcp-client";

const dummyId = ThoughtId.parse("th_dummy");
const dummyProjectId = ProjectId.parse("p_dummy");
const dummyProjectSlug = ProjectSlug.parse("dummy");

export const fakeBaseClient: McpClientLike = {
  captureThought: () => Promise.resolve({ thoughtId: dummyId, duplicate: false }),
  searchThoughts: () => Promise.resolve({ results: [] }),
  listThoughts: () => Promise.resolve({ thoughts: [] }),
  thoughtStats: () => Promise.resolve({ total: 0, byType: {}, topTopics: [], topPeople: [] }),
  memoryRecall: () => Promise.resolve({ results: [] }),
  memoryWriteback: () => Promise.resolve({ thoughtId: dummyId, trustGrade: "evidence" as const }),
  classifyThought: () => Promise.resolve({ type: "observation" as const }),
  enrichThought: () =>
    Promise.resolve({
      metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
    }),
  panBrainDump: () => Promise.resolve({ ideas: [] }),
  relatedThoughts: () => Promise.resolve({ results: [] }),
  updateThought: () => Promise.resolve({ thoughtId: dummyId, reEmbedded: true }),
  applyClassification: () => Promise.resolve({ type: "observation" as const, applied: true }),
  applyEnrichment: () =>
    Promise.resolve({
      metadata: { topics: [], people: [], action_items: [], dates_mentioned: [] },
      applied: true,
    }),
  applySplit: () => Promise.resolve({ created: 0, childIds: [] }),
  listProjects: () => Promise.resolve({ projects: [] }),
  createProject: () => Promise.resolve({ projectId: dummyProjectId, slug: dummyProjectSlug }),
  close: () => Promise.resolve(),
};
