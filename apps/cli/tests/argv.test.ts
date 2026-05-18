// biome-ignore-all lint/complexity/useLiteralKeys: flags is a Record<string,...>; tsc noPropertyAccessFromIndexSignature requires bracket access
import { describe, expect, test } from "bun:test";
import { parseArgv } from "../src/argv";

describe("parseArgv", () => {
  test("parses a bare command with no args", () => {
    const result = parseArgv(["whoami"]);
    expect(result.command).toBe("whoami");
    expect(result.positionals).toEqual([]);
    expect(result.flags).toEqual({});
  });

  test("returns null command for empty argv", () => {
    const result = parseArgv([]);
    expect(result.command).toBeNull();
  });

  test("collects positional args after the command", () => {
    const result = parseArgv(["capture", "hello", "world"]);
    expect(result.command).toBe("capture");
    expect(result.positionals).toEqual(["hello", "world"]);
  });

  test("parses --flag=value form", () => {
    const result = parseArgv(["login", "--server=https://x.example"]);
    expect(result.flags["server"]).toBe("https://x.example");
  });

  test("parses --flag value form", () => {
    const result = parseArgv(["login", "--server", "https://x.example"]);
    expect(result.flags["server"]).toBe("https://x.example");
  });

  test("parses boolean --flag with no value", () => {
    const result = parseArgv(["search", "foo", "--json"]);
    expect(result.flags["json"]).toBe(true);
    expect(result.positionals).toEqual(["foo"]);
  });

  test("parses short form -n with value", () => {
    const result = parseArgv(["search", "foo", "-n", "5"]);
    expect(result.flags["n"]).toBe("5");
  });

  test("treats everything after -- as positional", () => {
    const result = parseArgv(["capture", "--", "--not-a-flag", "stuff"]);
    expect(result.positionals).toEqual(["--not-a-flag", "stuff"]);
  });

  test("supports stdin marker `-` as a positional", () => {
    const result = parseArgv(["capture", "-"]);
    expect(result.positionals).toEqual(["-"]);
  });

  test("accepts multiple flags", () => {
    const result = parseArgv(["list", "--days", "7", "--type", "task", "--json"]);
    expect(result.flags["days"]).toBe("7");
    expect(result.flags["type"]).toBe("task");
    expect(result.flags["json"]).toBe(true);
  });

  test("does not consume the next token as a value when it looks like a flag", () => {
    const result = parseArgv(["list", "--json", "--days", "3"]);
    expect(result.flags["json"]).toBe(true);
    expect(result.flags["days"]).toBe("3");
  });

  test("treats --flag= with no value after the equals as an empty string", () => {
    const result = parseArgv(["x", "--server="]);
    expect(result.flags["server"]).toBe("");
  });
});
