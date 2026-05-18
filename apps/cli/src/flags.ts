/**
 * Typed helpers for working with the argv `flags` record.
 *
 * We keep all bracket-access in here so the `noPropertyAccessFromIndexSignature`
 * TS option (which forces bracket access) doesn't fight Biome's `useLiteralKeys`
 * rule (which prefers dot access) everywhere it's used.
 */

export type Flags = Record<string, string | boolean>;

export function flagString(flags: Flags, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

export function flagBoolean(flags: Flags, name: string): boolean {
  const v = flags[name];
  return v === true || v === "true";
}
