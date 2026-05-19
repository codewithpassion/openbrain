import type { z } from "zod";

export class ServiceInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ServiceInputError";
  }
}

export class ServiceAuthError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ServiceAuthError";
  }
}

export class ServiceNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ServiceNotFoundError";
  }
}

/**
 * Thrown when memory_review is asked to promote without status === "confirmed".
 * MCP / dashboard adapters map this to a user-visible failure.
 */
export class ReviewRequiresConfirmedError extends Error {
  public constructor() {
    super("promotion refused: status must be 'confirmed' to promote to instruction");
    this.name = "ReviewRequiresConfirmedError";
  }
}

export function assertUserId(userId: string): void {
  if (userId === "") {
    throw new ServiceAuthError("missing authenticated userId");
  }
}

export function parseInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceInputError(`invalid input: ${parsed.error.message}`);
  }
  return parsed.data;
}
