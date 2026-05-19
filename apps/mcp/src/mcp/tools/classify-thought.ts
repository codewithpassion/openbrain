import { classifyThoughtInputSchema, type ThoughtType } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

const FALLBACK_TYPE: ThoughtType = "observation";

/**
 * Fetch the thought by id and ask the metadata extractor to classify it. The
 * extractor returns a full metadata object; we surface only the type.
 *
 * The tool is read-only — does NOT mutate the thought. The caller decides
 * whether to persist the result (e.g. via a separate update tool, when one
 * exists).
 */
export async function classifyThoughtHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = classifyThoughtInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const rows = await envelope.deps.convex.getThoughtsByIds({
    userId: envelope.auth.userId,
    ids: [parsed.data.thoughtId],
  });
  const thought = rows[0];
  if (thought === undefined) {
    return err("thought not found");
  }
  const metadata = await envelope.deps.metadata.extract(thought.content);
  return ok({ type: metadata.type ?? FALLBACK_TYPE });
}
