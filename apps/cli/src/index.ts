#!/usr/bin/env bun
import { type ParsedArgv, parseArgv } from "./argv";
import { type Credentials, readCredentials, writeCredentials } from "./auth/credentials-store";
import { readStdin, runCapture } from "./commands/capture";
import { runClassify } from "./commands/classify";
import { runEdit } from "./commands/edit";
import { runEnrich } from "./commands/enrich";
import { runList } from "./commands/list";
import { runLogin } from "./commands/login";
import { runLogout } from "./commands/logout";
import { runPan } from "./commands/pan";
import {
  applyScopeFlag,
  runProjectCreate,
  runProjectList,
  runProjectUse,
} from "./commands/project";
import { runRecall } from "./commands/recall";
import { runRelated } from "./commands/related";
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

interface AuthedSession {
  client: ObMcpClient;
  credentials: Credentials;
}

async function requireSession(): Promise<AuthedSession> {
  const creds = await readCredentials();
  if (creds === null) {
    throw new NotSignedInError();
  }
  return { client: new ObMcpClient({ credentials: creds }), credentials: creds };
}

async function requireClient(): Promise<ObMcpClient> {
  return (await requireSession()).client;
}

function resolveScope(flags: Flags, creds: Credentials): string | undefined {
  return applyScopeFlag(flags, creds.activeProject);
}

function printHelp(): void {
  emit(`ob — OpenBrains CLI v${VERSION}

USAGE
  ob <command> [args] [--json] [--scope=<slug> | --no-scope]

COMMANDS
  login [--server <url>]     OAuth device-flow sign-in
  logout                     Remove stored credentials
  whoami                     Show signed-in user
  capture <content>          Capture a thought (use - to read from stdin)
  search <query> [-n N]      Semantic search
  recall <query> [-n N]      Memory recall with provenance
  list [--days N] [--type T] Recent thoughts
  stats                      Aggregate stats
  classify <id> [--apply]    LLM-classify a thought's metadata.type
                             (--apply: persist via fill-only setType)
  enrich <id> [--apply]      LLM-enrich a thought's metadata
                             (--apply: merge into thought metadata)
  pan <content>              Split a brain-dump into idea candidates
                             [--max-ideas N, default 5]
  pan <id> --apply           Persist split as N child thoughts
  related <id> [-n N]        Find semantically similar thoughts
                             [--threshold T, default 0.85]
  edit <id> [--content C|-]  Replace thought content (re-embeds)
  project list               List your projects (scope namespaces)
  project create <slug> <name> [description...]
                             Create a new project
  project use [<slug>]       Show or set the active project pin.
                             --clear removes the pin.

SCOPE
  Capture/list/search/recall accept --scope=<slug> to target a specific
  project, or --no-scope to force an unscoped read/write even when an
  active project is pinned. Without either flag, the active project from
  'ob project use' is used (and unscoped if none is pinned).

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
  const session = await requireSession();
  try {
    const scope = resolveScope(parsed.flags, session.credentials);
    return await runCapture({
      content,
      client: session.client,
      flags: parsed.flags,
      ...(scope === undefined ? {} : { scope }),
    });
  } finally {
    await session.client.close();
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
  const session = await requireSession();
  try {
    const limit = readLimitFlag(parsed.flags);
    const scope = resolveScope(parsed.flags, session.credentials);
    const opts = {
      query,
      client: session.client,
      flags: parsed.flags,
      ...(limit === undefined ? {} : { limit }),
      ...(scope === undefined ? {} : { scope }),
    };
    return command === "search" ? await runSearch(opts) : await runRecall(opts);
  } finally {
    await session.client.close();
  }
}

async function handleClientCommand(parsed: ParsedArgv, command: "list" | "stats"): Promise<number> {
  const session = await requireSession();
  try {
    if (command === "list") {
      const scope = resolveScope(parsed.flags, session.credentials);
      return await runList({
        client: session.client,
        flags: parsed.flags,
        ...(scope === undefined ? {} : { scope }),
      });
    }
    return await runStats({ client: session.client, flags: parsed.flags });
  } finally {
    await session.client.close();
  }
}

async function handleThoughtIdCommand(
  parsed: ParsedArgv,
  command: "classify" | "enrich" | "related",
): Promise<number> {
  const thoughtId = parsed.positionals[0];
  if (thoughtId === undefined || thoughtId === "") {
    emitError(`usage: ob ${command} <thoughtId>`);
    return 1;
  }
  const apply = flagBoolean(parsed.flags, "apply");
  const client = await requireClient();
  try {
    if (command === "classify") {
      return await runClassify({ thoughtId, apply, client, flags: parsed.flags });
    }
    if (command === "enrich") {
      return await runEnrich({ thoughtId, apply, client, flags: parsed.flags });
    }
    const limit = readLimitFlag(parsed.flags);
    const thresholdRaw = flagString(parsed.flags, "threshold");
    const threshold = thresholdRaw === undefined ? undefined : Number.parseFloat(thresholdRaw);
    const opts: Parameters<typeof runRelated>[0] = {
      thoughtId,
      client,
      flags: parsed.flags,
      ...(limit === undefined ? {} : { limit }),
      ...(threshold === undefined || Number.isNaN(threshold) ? {} : { threshold }),
    };
    return await runRelated(opts);
  } finally {
    await client.close();
  }
}

async function handleEdit(parsed: ParsedArgv): Promise<number> {
  const thoughtId = parsed.positionals[0];
  if (thoughtId === undefined || thoughtId === "") {
    emitError("usage: ob edit <thoughtId> [--content C | -]");
    return 1;
  }
  const explicit = flagString(parsed.flags, "content");
  let content: string;
  if (explicit !== undefined) {
    content = explicit;
  } else if (parsed.positionals[1] === "-") {
    content = (await readStdin()).trim();
  } else if (parsed.positionals.length > 1) {
    content = parsed.positionals.slice(1).join(" ");
  } else {
    emitError("edit: provide content via --content, positional args, or '-' for stdin");
    return 1;
  }
  if (content.length === 0) {
    emitError("edit: empty content");
    return 1;
  }
  const client = await requireClient();
  try {
    return await runEdit({ thoughtId, content, client, flags: parsed.flags });
  } finally {
    await client.close();
  }
}

async function handlePan(parsed: ParsedArgv): Promise<number> {
  const apply = flagBoolean(parsed.flags, "apply");
  const first = parsed.positionals[0];
  if (first === undefined) {
    emitError(apply ? "usage: ob pan <thoughtId> --apply" : "usage: ob pan <content>");
    return 1;
  }
  const maxIdeasRaw = flagString(parsed.flags, "max-ideas");
  const maxIdeas =
    maxIdeasRaw === undefined
      ? 5
      : Math.max(1, Math.min(20, Number.parseInt(maxIdeasRaw, 10) || 5));
  const client = await requireClient();
  try {
    if (apply) {
      return await runPan({
        thoughtId: first,
        apply: true,
        maxIdeas,
        client,
        flags: parsed.flags,
      });
    }
    const content = first === "-" ? (await readStdin()).trim() : parsed.positionals.join(" ");
    if (content.length === 0) {
      emitError("pan: empty content");
      return 1;
    }
    return await runPan({ content, apply: false, maxIdeas, client, flags: parsed.flags });
  } finally {
    await client.close();
  }
}

async function handleProject(parsed: ParsedArgv): Promise<number> {
  const sub = parsed.positionals[0];
  if (sub === undefined) {
    emitError("usage: ob project <list|create|use> [args]");
    return 1;
  }
  const session = await requireSession();
  try {
    if (sub === "list") {
      return await runProjectList({ client: session.client, flags: parsed.flags });
    }
    if (sub === "create") {
      return await runProjectCreate({
        args: parsed.positionals.slice(1),
        client: session.client,
        flags: parsed.flags,
      });
    }
    if (sub === "use") {
      const code = await runProjectUse({
        args: parsed.positionals.slice(1),
        client: session.client,
        flags: parsed.flags,
        readActive: () => session.credentials.activeProject,
        writeActive: async (active) => {
          const next: Credentials = {
            ...session.credentials,
            ...(active === undefined ? {} : { activeProject: active }),
          };
          if (active === undefined) {
            delete (next as { activeProject?: string }).activeProject;
          }
          await writeCredentials(next);
        },
      });
      return code;
    }
    emitError(`unknown project subcommand: ${sub}`);
    return 1;
  } finally {
    await session.client.close();
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
    case "classify":
      return await handleThoughtIdCommand(parsed, "classify");
    case "enrich":
      return await handleThoughtIdCommand(parsed, "enrich");
    case "related":
      return await handleThoughtIdCommand(parsed, "related");
    case "pan":
      return await handlePan(parsed);
    case "edit":
      return await handleEdit(parsed);
    case "project":
      return await handleProject(parsed);
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
