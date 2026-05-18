import { deleteCredentials, readCredentials } from "../auth/credentials-store";
import { emit } from "../output";

export async function runLogout(): Promise<number> {
  const existing = await readCredentials();
  deleteCredentials();
  if (existing === null) {
    emit("No credentials to remove.");
  } else {
    emit("Signed out.");
  }
  return 0;
}
