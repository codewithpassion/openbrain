import { enrichThoughtInputSchema } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

/**
 * Fetch the thought by id and ask the metadata extractor for richer metadata.
 * Read-only: does NOT mutate the thought. Caller persists if desired.
 */
export async function enrichThoughtHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = enrichThoughtInputSchema.safeParse(rawInput);
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
  return ok({ metadata });
}
