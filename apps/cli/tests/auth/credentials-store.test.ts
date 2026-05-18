// biome-ignore-all lint/complexity/useLiteralKeys: tsc noPropertyAccessFromIndexSignature requires bracket access on process.env
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Credentials,
  credentialsPath,
  readCredentials,
  writeCredentials,
} from "../../src/auth/credentials-store";
import { makeTmpHome, type TmpHome } from "../helpers/tmp-home";

describe("credentials store", () => {
  let home: TmpHome;
  let originalXdg: string | undefined;

  beforeEach(() => {
    home = makeTmpHome();
    originalXdg = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = home.dir;
  });

  afterEach(() => {
    if (originalXdg === undefined) {
      delete process.env["XDG_CONFIG_HOME"];
    } else {
      process.env["XDG_CONFIG_HOME"] = originalXdg;
    }
    home.cleanup();
  });

  test("readCredentials returns null when no file exists", async () => {
    const creds = await readCredentials();
    expect(creds).toBeNull();
  });

  test("writeCredentials then readCredentials roundtrips", async () => {
    const written: Credentials = {
      server: "https://mcp.example.com",
      accessToken: "at_123",
      refreshToken: "rt_123",
      expiresAt: 1_700_000_000_000,
      userId: "user_abc",
      email: "alice@example.com",
    };
    await writeCredentials(written);
    const read = await readCredentials();
    expect(read).toEqual(written);
  });

  test("writeCredentials persists file with mode 0600", async () => {
    await writeCredentials({
      server: "https://mcp.example.com",
      accessToken: "at_xyz",
      expiresAt: 1_700_000_000_000,
      userId: "user_abc",
    });
    const path = credentialsPath();
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("readCredentials throws on corrupted json", async () => {
    const path = credentialsPath();
    await writeCredentials({
      server: "https://x",
      accessToken: "x",
      expiresAt: 1,
      userId: "u",
    });
    writeFileSync(path, "{not json");
    await expect(readCredentials()).rejects.toThrow();
  });

  test("readCredentials throws on schema-invalid file", async () => {
    const path = credentialsPath();
    await writeCredentials({
      server: "https://x",
      accessToken: "x",
      expiresAt: 1,
      userId: "u",
    });
    writeFileSync(path, JSON.stringify({ server: "x" }));
    await expect(readCredentials()).rejects.toThrow();
  });

  test("credentialsPath honors XDG_CONFIG_HOME", () => {
    process.env["XDG_CONFIG_HOME"] = home.dir;
    expect(credentialsPath()).toBe(join(home.dir, "ob", "credentials.json"));
  });

  test("credentialsPath falls back to $HOME/.config when XDG is unset", () => {
    delete process.env["XDG_CONFIG_HOME"];
    process.env["HOME"] = home.dir;
    expect(credentialsPath()).toBe(join(home.dir, ".config", "ob", "credentials.json"));
  });
});
