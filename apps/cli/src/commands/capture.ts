import { ProjectSlug } from "@openbrains/shared";
import type { Flags } from "../flags";
import type { McpClientLike } from "../mcp-client";
import { emit, emitJson, isJsonFlag } from "../output";

export interface CaptureOptions {
  content: string;
  client: McpClientLike;
  flags: Flags;
  scope?: string;
}

export async function runCapture(opts: CaptureOptions): Promise<number> {
  const result = await opts.client.captureThought({
    content: opts.content,
    source: "cli",
    ...(opts.scope === undefined ? {} : { scope: ProjectSlug.parse(opts.scope) }),
  });
  if (isJsonFlag(opts.flags)) {
    emitJson(result);
  } else if (result.duplicate) {
    emit(`Already captured (duplicate): ${result.thoughtId}`);
  } else {
    emit(`Captured ${result.thoughtId}`);
  }
  return 0;
}

export async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
