export const DEFAULT_SERVER = "https://ob-mcp.openbrains.dev";
export const DEFAULT_CLIENT_ID = "ob-cli";

export function serverFromEnv(): string {
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  const v = process.env["OB_SERVER_URL"];
  return v !== undefined && v.length > 0 ? v : DEFAULT_SERVER;
}

export function isDebug(): boolean {
  // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
  return process.env["OB_DEBUG"] === "1";
}
