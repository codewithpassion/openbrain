# `@openbrains/cli` — the `ob` CLI

The `ob` command-line interface for OpenBrains. Authenticates against the MCP
Worker via the OAuth 2.0 Device Authorization Grant (RFC 8628) and then speaks
the Streamable HTTP MCP transport to capture, search, and recall thoughts.

## Install

This package is intended to run under Bun. The `bin` entry points at
`src/index.ts` so you can run it directly from a clone:

```bash
bun run apps/cli/src/index.ts <command>
```

A bundled distribution is produced by:

```bash
bun --filter @openbrains/cli build
# → apps/cli/dist/index.js
```

The bundle has a Bun shebang and is runnable as `./dist/index.js`. We don't
ship to npm in v1.

## Commands

```
ob login [--server <url>]     OAuth device-flow sign-in
ob logout                     Remove stored credentials
ob whoami                     Show signed-in user
ob capture <content>          Capture a thought (use - to read from stdin)
ob search <query> [-n N]      Semantic search
ob recall <query> [-n N]      Memory recall with provenance + trust grade
ob list [--days N] [--type T] Recent thoughts (--type observation|task|idea|reference|person_note)
ob stats                      Aggregate stats
```

Every command supports `--json` for machine-readable output. `--server` on
`login` overrides the default server (also configurable via `OB_SERVER_URL`).

## Auth flow — RFC 8628 device grant

1. `ob login` POSTs to `{server}/device_authorization` and receives a
   `user_code` plus a `verification_uri`.
2. The CLI prints the URL and the code. The user opens the URL in any
   browser and types the code.
3. While the user is signing in, the CLI polls `{server}/token` with
   `grant_type=urn:ietf:params:oauth:grant-type:device_code` at the
   server-supplied interval. `slow_down` responses bump the interval by 5s.
4. On success the CLI writes the bearer to
   `${XDG_CONFIG_HOME:-$HOME/.config}/ob/credentials.json` with mode `0600`.
5. Subsequent commands attach `Authorization: Bearer …` automatically. On a
   401 the CLI attempts one refresh-token rotation; on continued failure
   you'll be told to run `ob login`.

The CLI does **not** open a browser for you — RFC 8628 device flow is
designed for headless clients. Print, don't `open()`.

## Files on disk

- `~/.config/ob/credentials.json` (or `$XDG_CONFIG_HOME/ob/credentials.json`)
  — JSON, mode `0600`, validated by Zod on every read.

## Environment

- `OB_SERVER_URL` — override the default server.
- `OB_DEBUG=1` — print stack traces from unexpected errors.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | generic command failure (network, validation, etc.) |
| `2` | not signed in — run `ob login` |
| `3` | server returned a response that doesn't match the shared schemas |

## Tests

```bash
bun --filter @openbrains/cli test
bun --filter @openbrains/cli typecheck
```

The CLI is purely an MCP client — the tests use injected `FetchLike` adapters
and an in-memory fake server for the OAuth dance.
