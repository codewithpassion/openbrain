/**
 * Tiny output helpers. We use stdout.write directly because Biome bans console.log
 * and we want to emit machine-friendly JSON without extra noise.
 */

export function emit(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function emitJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function emitError(line: string): void {
  process.stderr.write(`${line}\n`);
}

import { type Flags, flagBoolean } from "./flags";

export function isJsonFlag(flags: Flags): boolean {
  return flagBoolean(flags, "json");
}
