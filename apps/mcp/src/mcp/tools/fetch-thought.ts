import { fetchInputSchema, ThoughtId } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

const TITLE_MAX = 80;

function makeTitle(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length <= TITLE_MAX ? oneLine : `${oneLine.slice(0, TITLE_MAX - 1)}…`;
}

export async function fetchThoughtHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = fetchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const userId = envelope.auth.userId;
  const id: string = parsed.data.id;
  const rows = await envelope.deps.convex.getThoughtsByIds({ userId, ids: [id] });
  const row = rows[0];
  if (row === undefined) {
    return err(`thought not found: ${id}`);
  }
  return ok({
    id: ThoughtId.parse(row._id),
    title: makeTitle(row.content),
    text: row.content,
    url: `openbrains://thoughts/${row._id}`,
    metadata: {
      source: row.source,
      createdAt: row.createdAt,
      ...(row.metadata.type === undefined ? {} : { type: row.metadata.type }),
      topics: row.metadata.topics,
      people: row.metadata.people,
    },
  });
}
