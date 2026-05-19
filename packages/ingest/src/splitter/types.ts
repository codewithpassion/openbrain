import type { ThoughtType } from "@openbrains/shared";

export interface BrainDumpIdea {
  content: string;
  type?: ThoughtType;
  topics: readonly string[];
}

export interface BrainDumpSplitter {
  split(content: string, maxIdeas: number): Promise<readonly BrainDumpIdea[]>;
}
