import { OAuthProvider, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { createClerkHandler } from "./auth/clerk-handler";
import type { WorkerEnv } from "./env";
import { mcpApiHandler } from "./mcp/handler";

// The OAuthProvider needs to know its own options to build helpers per
// request; the defaultHandler closes over them.
const oauthOptions: OAuthProviderOptions<WorkerEnv> = {
  apiRoute: "/mcp",
  apiHandler: mcpApiHandler,
  defaultHandler: createClerkHandler({
    get oauthOptions(): OAuthProviderOptions<WorkerEnv> {
      return oauthOptions;
    },
  }),
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["openid", "profile", "email"],
};

const provider = new OAuthProvider<WorkerEnv>(oauthOptions);

const handler: ExportedHandler<WorkerEnv> = {
  fetch: provider.fetch.bind(provider),
};

// biome-ignore lint/style/noDefaultExport: Cloudflare Workers entry requires `export default`.
export default handler;
