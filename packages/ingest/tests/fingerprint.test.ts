import { describe, expect, test } from "bun:test";
import { contentFingerprint } from "../src/fingerprint";

describe("contentFingerprint", () => {
  test("returns lowercase 64-char hex SHA-256", async () => {
    const fp = await contentFingerprint("hello world");
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  test("is deterministic across repeated calls", async () => {
    const inputs = Array.from({ length: 10 }, () => "Stable Input");
    const fingerprints = await Promise.all(inputs.map((s) => contentFingerprint(s)));
    const unique = new Set(fingerprints);
    expect(unique.size).toBe(1);
  });

  test("is invariant to interior whitespace runs", async () => {
    const a = await contentFingerprint("Hello World");
    const b = await contentFingerprint("hello   world");
    expect(a).toBe(b);
  });

  test("is invariant to case (lowercases via normalization)", async () => {
    const a = await contentFingerprint("HELLO WORLD");
    const b = await contentFingerprint("hello world");
    expect(a).toBe(b);
  });

  test("is invariant to leading/trailing whitespace", async () => {
    const a = await contentFingerprint("  hello world  ");
    const b = await contentFingerprint("hello world");
    expect(a).toBe(b);
  });

  test("produces different fingerprints for different content", async () => {
    const a = await contentFingerprint("hello world");
    const b = await contentFingerprint("hello worlds");
    expect(a).not.toBe(b);
  });
});
