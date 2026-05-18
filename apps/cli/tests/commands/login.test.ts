// biome-ignore-all lint/complexity/useLiteralKeys: tsc noPropertyAccessFromIndexSignature requires bracket access on process.env
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readCredentials } from "../../src/auth/credentials-store";
import { runLogin } from "../../src/commands/login";
import { fakeMcpServer } from "../helpers/fake-mcp-server";
import { makeTmpHome, type TmpHome } from "../helpers/tmp-home";

describe("runLogin", () => {
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

  test("writes credentials after a successful device flow", async () => {
    const server = fakeMcpServer({ baseUrl: "https://ob.example" });
    const code = await runLogin({
      server: "https://ob.example",
      fetch: server.fetch,
      delay: () => Promise.resolve(),
      now: () => 1_700_000_000_000,
      silent: true,
    });
    expect(code).toBe(0);
    const creds = await readCredentials();
    expect(creds).not.toBeNull();
    expect(creds?.accessToken).toBe("at_fake");
    expect(creds?.refreshToken).toBe("rt_fake");
    expect(creds?.server).toBe("https://ob.example");
  });

  test("retries through authorization_pending and eventually succeeds", async () => {
    const server = fakeMcpServer({ baseUrl: "https://ob.example", pendingCount: 2 });
    const code = await runLogin({
      server: "https://ob.example",
      fetch: server.fetch,
      delay: () => Promise.resolve(),
      now: () => 1_700_000_000_000,
      silent: true,
    });
    expect(code).toBe(0);
    // 1 /device_authorization + 3 /token (2 pending, 1 success)
    expect(server.calls).toHaveLength(4);
  });

  test("returns non-zero on access_denied", async () => {
    const server = fakeMcpServer({ baseUrl: "https://ob.example", pollError: "access_denied" });
    const code = await runLogin({
      server: "https://ob.example",
      fetch: server.fetch,
      delay: () => Promise.resolve(),
      now: () => 1_700_000_000_000,
      silent: true,
    });
    expect(code).toBe(1);
    const creds = await readCredentials();
    expect(creds).toBeNull();
  });
});
