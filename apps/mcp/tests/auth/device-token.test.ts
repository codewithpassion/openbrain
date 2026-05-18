import { describe, expect, test } from "bun:test";
import {
  DEVICE_TOKEN_PREFIX,
  signDeviceToken,
  verifyDeviceToken,
} from "../../src/auth/device-token";

const SECRET = "test-device-token-secret-32-bytes!";

describe("device-token HMAC", () => {
  test("round-trips claims through sign+verify", async () => {
    const now = (): number => 1_700_000_000_000;
    const token = await signDeviceToken(SECRET, {
      userId: "user_abc",
      email: "a@b.com",
      scope: ["openid", "email"],
      exp: 1_700_003_600,
      iat: 1_700_000_000,
    });
    expect(token.startsWith(DEVICE_TOKEN_PREFIX)).toBe(true);
    const verified = await verifyDeviceToken(SECRET, token, now);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe("user_abc");
    expect(verified?.email).toBe("a@b.com");
    expect(verified?.scope).toEqual(["openid", "email"]);
  });

  test("verify returns null for wrong secret", async () => {
    const token = await signDeviceToken(SECRET, {
      userId: "user_abc",
      scope: [],
      exp: 1_700_003_600,
      iat: 1_700_000_000,
    });
    const verified = await verifyDeviceToken(
      "different-secret-still-long-enough-here",
      token,
      () => 1_700_000_000_000,
    );
    expect(verified).toBeNull();
  });

  test("verify returns null for expired token", async () => {
    const token = await signDeviceToken(SECRET, {
      userId: "user_abc",
      scope: [],
      exp: 1_700_000_010,
      iat: 1_700_000_000,
    });
    const verified = await verifyDeviceToken(SECRET, token, () => 1_700_000_020_000);
    expect(verified).toBeNull();
  });

  test("verify returns null for non-prefixed token", async () => {
    const verified = await verifyDeviceToken(SECRET, "user:grant:secret", () => 0);
    expect(verified).toBeNull();
  });
});
