import type { AuthContext } from "../../src/auth/types";

export function makeAuthContext(userId: string, email?: string): AuthContext {
  return email === undefined ? { userId } : { userId, email };
}
