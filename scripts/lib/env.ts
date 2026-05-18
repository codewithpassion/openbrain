import { z } from "zod";

const MOCK_FALLBACK_SERVER = "https://mock.smoke.invalid";
const MOCK_FALLBACK_TOKEN = "obdev_mock_token_for_in_process_server";

export interface SmokeEnv {
  readonly mock: boolean;
  readonly serverUrl: string;
  readonly accessToken: string;
  readonly verbose: boolean;
}

const rawEnvSchema = z.object({
  OB_SERVER_URL: z.string().min(1).optional(),
  OB_ACCESS_TOKEN: z.string().min(1).optional(),
  OB_SMOKE_VERBOSE: z.string().optional(),
  OB_SMOKE_MOCK: z.string().optional(),
});

export type RawEnv = z.infer<typeof rawEnvSchema>;

/**
 * Resolve smoke-test inputs from a plain env object. Pure function for
 * testability — the script wires it to `process.env`. In MOCK mode we
 * relax the missing-var checks so CI can exercise the script offline.
 */
export function resolveSmokeEnv(rawEnv: Record<string, string | undefined>): SmokeEnv {
  const parsed = rawEnvSchema.parse(rawEnv);
  const mock = parsed.OB_SMOKE_MOCK === "1";
  const verbose = parsed.OB_SMOKE_VERBOSE === "1";

  if (mock) {
    return {
      mock: true,
      serverUrl: parsed.OB_SERVER_URL ?? MOCK_FALLBACK_SERVER,
      accessToken: parsed.OB_ACCESS_TOKEN ?? MOCK_FALLBACK_TOKEN,
      verbose,
    };
  }

  if (parsed.OB_SERVER_URL === undefined) {
    throw new Error(
      "Missing required env var OB_SERVER_URL (the deployed MCP Worker URL). " +
        "Set OB_SMOKE_MOCK=1 to run the offline mock instead.",
    );
  }
  if (parsed.OB_ACCESS_TOKEN === undefined) {
    throw new Error(
      "Missing required env var OB_ACCESS_TOKEN. Run `ob login` and copy the " +
        "accessToken from ~/.config/ob/credentials.json, or export it directly.",
    );
  }

  return {
    mock: false,
    serverUrl: parsed.OB_SERVER_URL,
    accessToken: parsed.OB_ACCESS_TOKEN,
    verbose,
  };
}
