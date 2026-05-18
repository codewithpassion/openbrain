import { describe, expect, test } from "bun:test";
import { resolveSmokeEnv } from "../../lib/env";

describe("resolveSmokeEnv", () => {
  test("returns mock mode when OB_SMOKE_MOCK=1", () => {
    const result = resolveSmokeEnv({ OB_SMOKE_MOCK: "1" });
    expect(result.mock).toBe(true);
  });

  test("uses fallback token in mock mode without OB_ACCESS_TOKEN", () => {
    const result = resolveSmokeEnv({ OB_SMOKE_MOCK: "1" });
    expect(result.accessToken.length).toBeGreaterThan(0);
    expect(result.serverUrl).toMatch(/^https?:\/\//);
  });

  test("requires OB_SERVER_URL in real mode", () => {
    expect(() => resolveSmokeEnv({})).toThrow(/OB_SERVER_URL/);
  });

  test("requires OB_ACCESS_TOKEN (or credentials file) in real mode", () => {
    expect(() => resolveSmokeEnv({ OB_SERVER_URL: "https://ob.example.com" })).toThrow(
      /OB_ACCESS_TOKEN/,
    );
  });

  test("accepts real-mode env with both vars set", () => {
    const result = resolveSmokeEnv({
      OB_SERVER_URL: "https://ob.example.com",
      OB_ACCESS_TOKEN: "obdev_token",
    });
    expect(result.mock).toBe(false);
    expect(result.serverUrl).toBe("https://ob.example.com");
    expect(result.accessToken).toBe("obdev_token");
  });

  test("verbose flag picked up from OB_SMOKE_VERBOSE=1", () => {
    const result = resolveSmokeEnv({
      OB_SERVER_URL: "https://ob.example.com",
      OB_ACCESS_TOKEN: "t",
      OB_SMOKE_VERBOSE: "1",
    });
    expect(result.verbose).toBe(true);
  });

  test("verbose defaults to false when OB_SMOKE_VERBOSE unset", () => {
    const result = resolveSmokeEnv({
      OB_SERVER_URL: "https://ob.example.com",
      OB_ACCESS_TOKEN: "t",
    });
    expect(result.verbose).toBe(false);
  });

  test("error names the missing variable", () => {
    let caught: unknown = null;
    try {
      resolveSmokeEnv({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/OB_SERVER_URL/);
  });
});
