#!/usr/bin/env bun
import { type ParsedArgv, parseArgv } from "./argv";
import { readCredentials } from "./auth/credentials-store";
import { readStdin, runCapture } from "./commands/capture";
import { runList } from "./commands/list";
import { runLogin } from "./commands/login";
import { runLogout } from "./commands/logout";
import { runRecall } from "./commands/recall";
import { runSearch } from "./commands/search";
import { runStats } from "./commands/stats";
import { runWhoami } from "./commands/whoami";
import { isDebug, serverFromEnv } from "./env";
import { NotSignedInError, UnexpectedServerResponseError } from "./errors";
import { type Flags, flagBoolean, flagString } from "./flags";
import { ObMcpClient } from "./mcp-client";
import { emit, emitError } from "./output";
import { VERSION } from "./version";

function readLimitFlag(flags: Flags): number | undefined {
  const v = flagString(flags, "n") ?? flagString(flags, "limit");
  if (v === undefined) {
    return undefined;
  }
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

async function requireClient(): Promise<ObMcpClient> {
  const creds = await readCredentials();
  if (creds === null) {
    throw new NotSignedInError();
  }
  return new ObMcpClient({ credentials: creds });
}

function printHelp(): void {
  emit(`ob — OpenBrains CLI v${VERSION}

USAGE
  ob <command> [args] [--json]

COMMANDS
  login [--server <url>]     OAuth device-flow sign-in
  logout                     Remove stored credentials
  whoami                     Show signed-in user
  capture <content>          Capture a thought (use - to read from stdin)
  search <query> [-n N]      Semantic search
  recall <query> [-n N]      Memory recall with provenance
  list [--days N] [--type T] Recent thoughts
  stats                      Aggregate stats

ENV
  OB_SERVER_URL              Override default server
  OB_DEBUG=1                 Print stack traces
`);
}

async function handleCapture(parsed: ParsedArgv): Promise<number> {
  const first = parsed.positionals[0];
  if (first === undefined) {
    emitError("usage: ob capture <content>");
    return 1;
  }
  const content = first === "-" ? (await readStdin()).trim() : parsed.positionals.join(" ");
  if (content.length === 0) {
    emitError("capture: empty content");
    return 1;
  }
  const client = await requireClient();
  try {
    return await runCapture({ content, client, flags: parsed.flags });
  } finally {
    await client.close();
  }
}

async function handleQueryCommand(
  parsed: ParsedArgv,
  command: "search" | "recall",
): Promise<number> {
  const query = parsed.positionals.join(" ");
  if (query.length === 0) {
    emitError(`usage: ob ${command} <query>`);
    return 1;
  }
  const client = await requireClient();
  try {
    const limit = readLimitFlag(parsed.flags);
    const opts = {
      query,
      client,
      flags: parsed.flags,
      ...(limit === undefined ? {} : { limit }),
    };
    return command === "search" ? await runSearch(opts) : await runRecall(opts);
  } finally {
    await client.close();
  }
}

async function handleClientCommand(parsed: ParsedArgv, command: "list" | "stats"): Promise<number> {
  const client = await requireClient();
  try {
    return command === "list"
      ? await runList({ client, flags: parsed.flags })
      : await runStats({ client, flags: parsed.flags });
  } finally {
    await client.close();
  }
}

async function dispatch(parsed: ParsedArgv): Promise<number> {
  switch (parsed.command) {
    case "login": {
      const server = flagString(parsed.flags, "server") ?? serverFromEnv();
      return await runLogin({ server });
    }
    case "logout":
      return await runLogout();
    case "whoami":
      return await runWhoami({ flags: parsed.flags });
    case "capture":
      return await handleCapture(parsed);
    case "search":
      return await handleQueryCommand(parsed, "search");
    case "recall":
      return await handleQueryCommand(parsed, "recall");
    case "list":
      return await handleClientCommand(parsed, "list");
    case "stats":
      return await handleClientCommand(parsed, "stats");
    default: {
      emitError(`unknown command: ${parsed.command ?? "(none)"}`);
      printHelp();
      return 1;
    }
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgv(argv);
  if (parsed.command === null || parsed.command === "help" || flagBoolean(parsed.flags, "help")) {
    printHelp();
    return 0;
  }
  if (flagBoolean(parsed.flags, "version") || parsed.command === "version") {
    emit(VERSION);
    return 0;
  }
  return await dispatch(parsed);
}

const args = process.argv.slice(2);
try {
  const code = await main(args);
  process.exit(code);
} catch (err) {
  if (err instanceof NotSignedInError) {
    emitError(err.message);
    process.exit(2);
  }
  if (err instanceof UnexpectedServerResponseError) {
    emitError(err.message);
    process.exit(3);
  }
  const msg = err instanceof Error ? err.message : String(err);
  emitError(`error: ${msg}`);
  if (isDebug() && err instanceof Error && err.stack !== undefined) {
    emitError(err.stack);
  }
  process.exit(1);
}
