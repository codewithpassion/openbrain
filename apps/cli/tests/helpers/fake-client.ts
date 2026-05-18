import { ThoughtId } from "@openbrains/shared";
import type { McpClientLike } from "../../src/mcp-client";

const dummyId = ThoughtId.parse("th_dummy");

export const fakeBaseClient: McpClientLike = {
  captureThought: () => Promise.resolve({ thoughtId: dummyId, duplicate: false }),
  searchThoughts: () => Promise.resolve({ results: [] }),
  listThoughts: () => Promise.resolve({ thoughts: [] }),
  thoughtStats: () => Promise.resolve({ total: 0, byType: {}, topTopics: [], topPeople: [] }),
  memoryRecall: () => Promise.resolve({ results: [] }),
  memoryWriteback: () => Promise.resolve({ thoughtId: dummyId, trustGrade: "evidence" as const }),
  close: () => Promise.resolve(),
};
