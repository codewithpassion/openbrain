import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

export const credentialsSchema = z.object({
  server: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.number().int().positive(),
  userId: z.string().min(1),
  email: z.string().min(1).optional(),
});

export type Credentials = z.infer<typeof credentialsSchema>;

function configHome(): string {
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg !== undefined && xdg.length > 0) {
    return xdg;
  }
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  const home = process.env["HOME"];
  if (home === undefined || home.length === 0) {
    throw new Error("neither XDG_CONFIG_HOME nor HOME is set");
  }
  return join(home, ".config");
}

export function credentialsPath(): string {
  return join(configHome(), "ob", "credentials.json");
}

export async function readCredentials(): Promise<Credentials | null> {
  const path = credentialsPath();
  if (!existsSync(path)) {
    return null;
  }
  const raw = await Bun.file(path).text();
  const parsed: unknown = JSON.parse(raw);
  return credentialsSchema.parse(parsed);
}

export function writeCredentials(creds: Credentials): Promise<void> {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Validate before writing — we never want a corrupted store on disk.
  const validated = credentialsSchema.parse(creds);
  // writeFileSync with `mode` creates the file with 0o600 atomically (no umask window).
  // chmod is still applied for the overwrite case where the file already exists with looser perms.
  writeFileSync(path, JSON.stringify(validated, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
  return Promise.resolve();
}

export function deleteCredentials(): void {
  const path = credentialsPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
