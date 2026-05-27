import { type ListThoughtsInput, ProjectSlug, type ThoughtType } from "@openbrains/shared";
import { type Flags, flagString } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface ListOptions {
  client: McpClientLike;
  flags: Flags;
  scope?: string;
}

function parseDays(flags: Flags): number | undefined {
  const v = flagString(flags, "days");
  if (v === undefined) {
    return undefined;
  }
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseType(flags: Flags): ThoughtType | undefined {
  const v = flagString(flags, "type");
  if (v === undefined) {
    return undefined;
  }
  const allowed = ["observation", "task", "idea", "reference", "person_note"] as const;
  return allowed.find((a) => a === v);
}

export async function runList(opts: ListOptions): Promise<number> {
  const days = parseDays(opts.flags);
  const type = parseType(opts.flags);
  const input: ListThoughtsInput = {
    limit: 20,
    ...(days === undefined ? {} : { days }),
    ...(type === undefined ? {} : { type }),
    ...(opts.scope === undefined ? {} : { scope: ProjectSlug.parse(opts.scope) }),
  };
  const result = await opts.client.listThoughts(input);
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
    return 0;
  }
  if (result.thoughts.length === 0) {
    emit("No thoughts.");
    return 0;
  }
  for (const t of result.thoughts) {
    const stamp = new Date(t.createdAt).toISOString();
    emit(`${stamp}  ${t.id}  ${t.content.replace(/\s+/g, " ").slice(0, 100)}`);
  }
  return 0;
}
