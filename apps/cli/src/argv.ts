/**
 * Tiny hand-rolled argv parser.
 *
 * Supports: --flag, --flag=value, --flag value, -f, -f value, `--` end-of-options.
 * The first non-flag token is the `command`. Everything after `--` is positional.
 */

export interface ParsedArgv {
  command: string | null;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function isLongFlag(tok: string): boolean {
  return tok.startsWith("--") && tok.length > 2;
}

function isShortFlag(tok: string): boolean {
  return tok.startsWith("-") && tok.length > 1 && !tok.startsWith("--") && tok !== "-";
}

function looksLikeFlag(tok: string): boolean {
  return isLongFlag(tok) || isShortFlag(tok);
}

interface FlagConsumed {
  name: string;
  value: string | boolean;
  /** how many argv tokens were consumed (1 = just the flag, 2 = flag and following value) */
  consumed: number;
}

function consumeLongFlag(tok: string, next: string | undefined): FlagConsumed {
  const eq = tok.indexOf("=");
  if (eq >= 0) {
    return { name: tok.slice(2, eq), value: tok.slice(eq + 1), consumed: 1 };
  }
  const name = tok.slice(2);
  if (next !== undefined && !looksLikeFlag(next) && next !== "--") {
    return { name, value: next, consumed: 2 };
  }
  return { name, value: true, consumed: 1 };
}

function consumeShortFlag(tok: string, next: string | undefined): FlagConsumed {
  const name = tok.slice(1);
  if (next !== undefined && !looksLikeFlag(next) && next !== "--") {
    return { name, value: next, consumed: 2 };
  }
  return { name, value: true, consumed: 1 };
}

export function parseArgv(argv: readonly string[]): ParsedArgv {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command: string | null = null;
  let endOfOptions = false;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) {
      continue;
    }
    if (endOfOptions) {
      positionals.push(tok);
      continue;
    }
    if (tok === "--") {
      endOfOptions = true;
      continue;
    }
    if (isLongFlag(tok)) {
      const c = consumeLongFlag(tok, argv[i + 1]);
      flags[c.name] = c.value;
      i += c.consumed - 1;
      continue;
    }
    if (isShortFlag(tok)) {
      const c = consumeShortFlag(tok, argv[i + 1]);
      flags[c.name] = c.value;
      i += c.consumed - 1;
      continue;
    }
    if (command === null) {
      command = tok;
    } else {
      positionals.push(tok);
    }
  }

  return { command, positionals, flags };
}
