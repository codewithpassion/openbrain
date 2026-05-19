import { panBrainDumpInputSchema } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Splits a freeform brain-dump into discrete idea candidates via the LLM
 * splitter adapter. Read-only — does not persist; caller can pipe results
 * into `capture_thought` if they want to commit them.
 */
export async function panBrainDumpHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = panBrainDumpInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const ideas = await envelope.deps.splitter.split(parsed.data.content, parsed.data.maxIdeas);
  return ok({
    ideas: ideas.map((i) => ({
      content: i.content,
      ...(i.type === undefined ? {} : { type: i.type }),
      topics: [...i.topics],
    })),
  });
}
