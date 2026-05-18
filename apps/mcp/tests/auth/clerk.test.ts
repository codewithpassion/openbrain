import { beforeAll, describe, expect, test } from "bun:test";
import { exportJWK, generateKeyPair, type JSONWebKeySet, SignJWT } from "jose";
import { ClerkAuthError, createClerkLocalVerifier } from "../../src/auth/clerk";

const ISSUER = "https://test.clerk.accounts.dev";

interface Fixture {
  jwks: JSONWebKeySet;
  signingKey: CryptoKey;
  kid: string;
}

let fixture: Fixture;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.alg = "RS256";
  jwk.use = "sig";
  jwk.kid = "test-key-1";
  fixture = {
    jwks: { keys: [jwk] },
    signingKey: privateKey,
    kid: "test-key-1",
  };
});

async function sign(claims: {
  sub?: string;
  email?: string;
  iss?: string;
  exp?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({
    ...(claims.email === undefined ? {} : { email: claims.email }),
  })
    .setProtectedHeader({ alg: "RS256", kid: fixture.kid })
    .setIssuer(claims.iss ?? ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(claims.exp ?? now + 60);
  if (claims.sub !== undefined) {
    builder.setSubject(claims.sub);
  }
  return await builder.sign(fixture.signingKey);
}

describe("createClerkLocalVerifier", () => {
  test("accepts a properly signed token and returns sub + email", async () => {
    const verifier = createClerkLocalVerifier({ jwks: fixture.jwks, issuer: ISSUER });
    const token = await sign({ sub: "user_abc", email: "a@b.com" });
    const identity = await verifier.verify(token);
    expect(identity.userId).toBe("user_abc");
    expect(identity.email).toBe("a@b.com");
  });

  test("rejects an expired token", async () => {
    const verifier = createClerkLocalVerifier({ jwks: fixture.jwks, issuer: ISSUER });
    const token = await sign({ sub: "user_abc", exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(ClerkAuthError);
  });

  test("rejects a token with the wrong issuer", async () => {
    const verifier = createClerkLocalVerifier({ jwks: fixture.jwks, issuer: ISSUER });
    const token = await sign({ sub: "user_abc", iss: "https://attacker.example/" });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(ClerkAuthError);
  });

  test("rejects a token signed by a different key", async () => {
    const otherKeys = await generateKeyPair("RS256", { extractable: true });
    const verifier = createClerkLocalVerifier({ jwks: fixture.jwks, issuer: ISSUER });
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: fixture.kid })
      .setIssuer(ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .setSubject("user_abc")
      .sign(otherKeys.privateKey);
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(ClerkAuthError);
  });
});
