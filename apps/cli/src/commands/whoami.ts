import { readCredentials } from "../auth/credentials-store";
import { NotSignedInError } from "../errors";
import type { Flags } from "../flags";
import { emit, emitJson, isJsonFlag } from "../output";

export interface WhoamiOptions {
  flags: Flags;
}

export async function runWhoami(opts: WhoamiOptions): Promise<number> {
  const creds = await readCredentials();
  if (creds === null) {
    throw new NotSignedInError();
  }
  if (isJsonFlag(opts.flags)) {
    emitJson({ userId: creds.userId, email: creds.email, server: creds.server });
    return 0;
  }
  emit(`Signed in as ${creds.email ?? creds.userId} (${creds.server})`);
  return 0;
}
