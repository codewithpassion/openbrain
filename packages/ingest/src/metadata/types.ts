import type { ThoughtMetadata } from "@openbrains/shared";

export interface MetadataExtractor {
  extract(content: string): Promise<ThoughtMetadata>;
}
