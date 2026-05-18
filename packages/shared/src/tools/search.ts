import { z } from "zod";
import { ThoughtId } from "../ids";

/**
 * ChatGPT/connector-compatibility search shape.
 * Returns `[{ id, title, url }]` — see ARCHITECTURE.md "MCP tools (v1)".
 * For rich semantic search use `search_thoughts` instead.
 */
export const searchInputSchema = z.object({
  query: z.string().min(1).max(2_000),
});
export type SearchInput = z.infer<typeof searchInputSchema>;

export const searchOutputSchema = z.object({
  results: z.array(
    z.object({
      id: ThoughtId,
      title: z.string().min(1),
      url: z.string().min(1),
    }),
  ),
});
export type SearchOutput = z.infer<typeof searchOutputSchema>;
