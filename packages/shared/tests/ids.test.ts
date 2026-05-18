import { describe, expect, test } from "bun:test";
import { ApiKeyId, ThoughtId, UserId } from "../src/ids";

describe("UserId", () => {
  test("parses a non-empty string and returns a branded value", () => {
    const id: string = UserId.parse("user_abc123");
    expect(id).toBe("user_abc123");
  });

  test("rejects an empty string", () => {
    const result = UserId.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.code).toBe("too_small");
      expect(issue?.path).toEqual([]);
    }
  });

  test("rejects a non-string", () => {
    const result = UserId.safeParse(42);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe("invalid_type");
    }
  });
});

describe("ThoughtId", () => {
  test("parses a non-empty string", () => {
    const id: string = ThoughtId.parse("k123abc");
    expect(id).toBe("k123abc");
  });

  test("rejects an empty string", () => {
    expect(ThoughtId.safeParse("").success).toBe(false);
  });
});

describe("ApiKeyId", () => {
  test("parses a non-empty string", () => {
    const id: string = ApiKeyId.parse("ak_xyz");
    expect(id).toBe("ak_xyz");
  });

  test("rejects an empty string", () => {
    expect(ApiKeyId.safeParse("").success).toBe(false);
  });
});

describe("branded id types are not assignable from a plain string", () => {
  test("a raw string cannot be passed where a UserId is expected", () => {
    const takesUserId = (_id: UserId): void => undefined;
    // @ts-expect-error a plain string is not a UserId
    takesUserId("raw-string");
    // valid path: parse first
    takesUserId(UserId.parse("ok"));
    expect(true).toBe(true);
  });

  test("ThoughtId and UserId are distinct brands", () => {
    const takesThoughtId = (_id: ThoughtId): void => undefined;
    const userId = UserId.parse("u1");
    // @ts-expect-error UserId is not assignable to ThoughtId
    takesThoughtId(userId);
    expect(true).toBe(true);
  });
});
