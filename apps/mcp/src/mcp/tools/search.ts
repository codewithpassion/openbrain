import { searchInputSchema, ThoughtId } from "@openbrains/shared";
import { err, ok, type ToolEnvelope, type ToolTextResult } from "./types";

const DEFAULT_TOPK = 10;
const TITLE_MAX = 80;

function makeTitle(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_MAX) {
    return oneLine;
  }
  return `${oneLine.slice(0, TITLE_MAX - 1)}…`;
}

/** ChatGPT/connector compatibility — returns `[{id, title, url}]`. */
export async function searchHandler(
  rawInput: unknown,
  envelope: ToolEnvelope,
): Promise<ToolTextResult> {
  if (envelope.auth.userId === "") {
    return err("missing authenticated userId");
  }
  const parsed = searchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(`invalid input: ${parsed.error.message}`);
  }
  const userId = envelope.auth.userId;
  const embedding = await envelope.deps.embeddings.embed(parsed.data.query);
  const matches = await envelope.deps.vectorize.query({
    userId,
    values: embedding.vector,
    topK: DEFAULT_TOPK,
  });
  if (matches.length === 0) {
    return ok({ results: [] });
  }
  const rows = await envelope.deps.convex.getThoughtsByIds({
    userId,
    ids: matches.map((m) => m.id),
  });
  const byId = new Map(rows.map((r) => [r._id, r] as const));
  const results = matches
    .map((m) => {
      const row = byId.get(m.id);
      if (row === undefined) {
        return null;
      }
      return {
        id: ThoughtId.parse(row._id),
        title: makeTitle(row.content),
        url: `openbrains://thoughts/${row._id}`,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return ok({ results });
}
