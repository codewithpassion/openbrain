import { z } from "zod";
import { ThoughtId } from "../ids";

/**
 * ChatGPT/connector-compatibility fetch shape.
 * Returns the full thought by id — see ARCHITECTURE.md "MCP tools (v1)".
 */
export const fetchInputSchema = z.object({
  id: ThoughtId,
});
export type FetchInput = z.infer<typeof fetchInputSchema>;

export const fetchOutputSchema = z.object({
  id: ThoughtId,
  title: z.string().min(1),
  text: z.string().min(1),
  url: z.string().min(1),
  metadata: z.record(z.string().min(1), z.unknown()).optional(),
});
export type FetchOutput = z.infer<typeof fetchOutputSchema>;
