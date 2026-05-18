import {
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  type JSONWebKeySet,
  type JWTPayload,
  jwtVerify,
} from "jose";

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Verifier resolver: returns the function jose uses to look up a signing key
 * per token header. Tests use `createLocalJWKSet(fixture)` to stay offline.
 * Production uses `createRemoteJWKSet(url)`.
 */
export type JWKSResolver =
  | ReturnType<typeof createRemoteJWKSet>
  | ReturnType<typeof createLocalJWKSet>;

export interface ClerkVerifierOptions {
  jwksResolver: JWKSResolver;
  issuer: string;
}

export interface ClerkIdentity {
  userId: string;
  email?: string;
}

export class ClerkAuthError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClerkAuthError";
  }
}

export interface ClerkVerifier {
  verify(token: string): Promise<ClerkIdentity>;
}

export function createClerkVerifier(options: ClerkVerifierOptions): ClerkVerifier {
  return {
    async verify(token) {
      let payload: JWTPayload;
      try {
        const result = await jwtVerify(token, options.jwksResolver, {
          issuer: options.issuer,
        });
        payload = result.payload;
      } catch (cause) {
        throw new ClerkAuthError(`clerk token verification failed: ${(cause as Error).message}`, {
          cause,
        });
      }
      if (typeof payload.sub !== "string" || payload.sub === "") {
        throw new ClerkAuthError("clerk token missing sub claim");
      }
      const identity: ClerkIdentity = { userId: payload.sub };
      if (typeof payload["email"] === "string") {
        identity.email = payload["email"];
      }
      return identity;
    },
  };
}

/** Production helper: builds a remote-JWKS-backed verifier. */
export function createClerkRemoteVerifier(args: {
  jwksUrl: string;
  issuer: string;
  fetch?: FetchLike;
}): ClerkVerifier {
  const opts: Parameters<typeof createRemoteJWKSet>[1] = {};
  if (args.fetch !== undefined) {
    const f = args.fetch;
    opts[customFetch] = (url, init) => f(url, init);
  }
  const jwksResolver = createRemoteJWKSet(new URL(args.jwksUrl), opts);
  return createClerkVerifier({ jwksResolver, issuer: args.issuer });
}

/** Test helper: builds a verifier from an in-memory JWK Set. */
export function createClerkLocalVerifier(args: {
  jwks: JSONWebKeySet;
  issuer: string;
}): ClerkVerifier {
  const jwksResolver = createLocalJWKSet(args.jwks);
  return createClerkVerifier({ jwksResolver, issuer: args.issuer });
}
