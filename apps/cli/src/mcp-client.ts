import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike as SdkFetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  type ApplyClassificationInput,
  type ApplyEnrichmentInput,
  type ApplySplitInput,
  applyClassificationOutputSchema,
  applyEnrichmentOutputSchema,
  applySplitOutputSchema,
  type CaptureThoughtInput,
  type ClassifyThoughtInput,
  type CreateProjectInput,
  captureThoughtOutputSchema,
  classifyThoughtOutputSchema,
  createProjectOutputSchema,
  type EnrichThoughtInput,
  enrichThoughtOutputSchema,
  type ListThoughtsInput,
  listProjectsOutputSchema,
  listThoughtsOutputSchema,
  type MemoryRecallInput,
  type MemoryWritebackInput,
  memoryRecallOutputSchema,
  memoryWritebackOutputSchema,
  type PanBrainDumpInput,
  panBrainDumpOutputSchema,
  type RelatedThoughtsInput,
  relatedThoughtsOutputSchema,
  type SearchThoughtsInput,
  searchThoughtsOutputSchema,
  thoughtStatsOutputSchema,
  type UpdateThoughtInput,
  updateThoughtOutputSchema,
} from "@openbrains/shared";
import type { Credentials } from "./auth/credentials-store";
import { writeCredentials } from "./auth/credentials-store";
import type { FetchLike } from "./auth/device-flow";
import { refreshAccessToken } from "./auth/refresh";
import { DEFAULT_CLIENT_ID } from "./env";
import { NotSignedInError, UnexpectedServerResponseError } from "./errors";
import { VERSION } from "./version";

export interface McpClientDeps {
  credentials: Credentials;
  fetch?: FetchLike;
  /**
   * If provided, called when an access token is refreshed so callers can persist it.
   * Defaults to writing the credentials file.
   */
  onTokensRefreshed?: (updated: Credentials) => Promise<void>;
}

interface MutableCreds {
  current: Credentials;
}

function buildAuthFetch(state: MutableCreds, base: FetchLike): SdkFetchLike {
  let refreshing = false;

  const withAuth = (url: string | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${state.current.accessToken}`);
    const finalInit: RequestInit = { ...(init ?? {}), headers };
    return base(typeof url === "string" ? url : url.toString(), finalInit);
  };

  return async (url, init) => {
    const first = await withAuth(url, init);
    if (first.status !== 401) {
      return first;
    }
    if (refreshing) {
      // Already tried to refresh; surface the 401.
      return first;
    }
    const refreshToken = state.current.refreshToken;
    if (refreshToken === undefined) {
      return first;
    }
    refreshing = true;
    try {
      const token = await refreshAccessToken({
        server: state.current.server,
        fetch: base,
        clientId: DEFAULT_CLIENT_ID,
        refreshToken,
      });
      const expiresAt =
        Date.now() + (token.expires_in === undefined ? 3600_000 : token.expires_in * 1000);
      const refreshed: Credentials = {
        ...state.current,
        accessToken: token.access_token,
        expiresAt,
        ...(token.refresh_token === undefined ? {} : { refreshToken: token.refresh_token }),
      };
      state.current = refreshed;
      await writeCredentials(refreshed);
      return await withAuth(url, init);
    } catch {
      return first;
    } finally {
      refreshing = false;
    }
  };
}

export class ObMcpClient {
  private readonly client: Client;
  private readonly transport: StreamableHTTPClientTransport;
  private connected = false;

  public constructor(deps: McpClientDeps) {
    const state: MutableCreds = { current: deps.credentials };
    const base: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
    const wrapped = buildAuthFetch(state, base);
    this.transport = new StreamableHTTPClientTransport(new URL(`${deps.credentials.server}/mcp`), {
      fetch: wrapped,
    });
    this.client = new Client({ name: "ob-cli", version: VERSION });
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    // The MCP SDK declares Transport#sessionId as `string` while the implementation
    // returns `string | undefined`; cast at the trust boundary.
    await this.client.connect(this.transport as unknown as Parameters<Client["connect"]>[0]);
    this.connected = true;
  }

  public async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  private parseStructured<T>(
    result: { structuredContent?: Record<string, unknown> | undefined; isError?: boolean },
    schema: { parse: (input: unknown) => T },
    toolName: string,
  ): T {
    if (result.isError === true) {
      throw new UnexpectedServerResponseError(`MCP tool ${toolName} returned an error result`);
    }
    if (result.structuredContent === undefined) {
      throw new UnexpectedServerResponseError(`MCP tool ${toolName} returned no structuredContent`);
    }
    try {
      return schema.parse(result.structuredContent);
    } catch (err) {
      throw new UnexpectedServerResponseError(
        `MCP tool ${toolName} output failed schema validation: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err },
      );
    }
  }

  private async call(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{
    structuredContent?: Record<string, unknown> | undefined;
    isError?: boolean;
  }> {
    await this.connect();
    try {
      const result = await this.client.callTool({ name: toolName, arguments: args });
      const structured = result.structuredContent;
      return {
        structuredContent:
          typeof structured === "object" && structured !== null
            ? (structured as Record<string, unknown>)
            : undefined,
        isError: result.isError === true,
      };
    } catch (err) {
      if (err instanceof Error && /401|unauthor/i.test(err.message)) {
        throw new NotSignedInError();
      }
      throw err;
    }
  }

  public async captureThought(
    input: CaptureThoughtInput,
  ): Promise<ReturnType<typeof captureThoughtOutputSchema.parse>> {
    const result = await this.call("capture_thought", input);
    return this.parseStructured(result, captureThoughtOutputSchema, "capture_thought");
  }

  public async searchThoughts(
    input: SearchThoughtsInput,
  ): Promise<ReturnType<typeof searchThoughtsOutputSchema.parse>> {
    const result = await this.call("search_thoughts", input);
    return this.parseStructured(result, searchThoughtsOutputSchema, "search_thoughts");
  }

  public async listThoughts(
    input: ListThoughtsInput,
  ): Promise<ReturnType<typeof listThoughtsOutputSchema.parse>> {
    const result = await this.call("list_thoughts", input);
    return this.parseStructured(result, listThoughtsOutputSchema, "list_thoughts");
  }

  public async thoughtStats(): Promise<ReturnType<typeof thoughtStatsOutputSchema.parse>> {
    const result = await this.call("thought_stats", {});
    return this.parseStructured(result, thoughtStatsOutputSchema, "thought_stats");
  }

  public async memoryRecall(
    input: MemoryRecallInput,
  ): Promise<ReturnType<typeof memoryRecallOutputSchema.parse>> {
    const result = await this.call("memory_recall", input);
    return this.parseStructured(result, memoryRecallOutputSchema, "memory_recall");
  }

  public async memoryWriteback(
    input: MemoryWritebackInput,
  ): Promise<ReturnType<typeof memoryWritebackOutputSchema.parse>> {
    const result = await this.call("memory_writeback", input);
    return this.parseStructured(result, memoryWritebackOutputSchema, "memory_writeback");
  }

  public async classifyThought(
    input: ClassifyThoughtInput,
  ): Promise<ReturnType<typeof classifyThoughtOutputSchema.parse>> {
    const result = await this.call("classify_thought", input);
    return this.parseStructured(result, classifyThoughtOutputSchema, "classify_thought");
  }

  public async enrichThought(
    input: EnrichThoughtInput,
  ): Promise<ReturnType<typeof enrichThoughtOutputSchema.parse>> {
    const result = await this.call("enrich_thought", input);
    return this.parseStructured(result, enrichThoughtOutputSchema, "enrich_thought");
  }

  public async panBrainDump(
    input: PanBrainDumpInput,
  ): Promise<ReturnType<typeof panBrainDumpOutputSchema.parse>> {
    const result = await this.call("pan_brain_dump", input);
    return this.parseStructured(result, panBrainDumpOutputSchema, "pan_brain_dump");
  }

  public async relatedThoughts(
    input: RelatedThoughtsInput,
  ): Promise<ReturnType<typeof relatedThoughtsOutputSchema.parse>> {
    const result = await this.call("related_thoughts", input);
    return this.parseStructured(result, relatedThoughtsOutputSchema, "related_thoughts");
  }

  public async updateThought(
    input: UpdateThoughtInput,
  ): Promise<ReturnType<typeof updateThoughtOutputSchema.parse>> {
    const result = await this.call("update_thought", input);
    return this.parseStructured(result, updateThoughtOutputSchema, "update_thought");
  }

  public async applyClassification(
    input: ApplyClassificationInput,
  ): Promise<ReturnType<typeof applyClassificationOutputSchema.parse>> {
    const result = await this.call("classify_thought_apply", input);
    return this.parseStructured(result, applyClassificationOutputSchema, "classify_thought_apply");
  }

  public async applyEnrichment(
    input: ApplyEnrichmentInput,
  ): Promise<ReturnType<typeof applyEnrichmentOutputSchema.parse>> {
    const result = await this.call("enrich_thought_apply", input);
    return this.parseStructured(result, applyEnrichmentOutputSchema, "enrich_thought_apply");
  }

  public async applySplit(
    input: ApplySplitInput,
  ): Promise<ReturnType<typeof applySplitOutputSchema.parse>> {
    const result = await this.call("pan_brain_dump_apply", input);
    return this.parseStructured(result, applySplitOutputSchema, "pan_brain_dump_apply");
  }

  public async listProjects(): Promise<ReturnType<typeof listProjectsOutputSchema.parse>> {
    const result = await this.call("list_projects", {});
    return this.parseStructured(result, listProjectsOutputSchema, "list_projects");
  }

  public async createProject(
    input: CreateProjectInput,
  ): Promise<ReturnType<typeof createProjectOutputSchema.parse>> {
    const result = await this.call("create_project", input);
    return this.parseStructured(result, createProjectOutputSchema, "create_project");
  }
}

export interface McpClientLike {
  captureThought: ObMcpClient["captureThought"];
  searchThoughts: ObMcpClient["searchThoughts"];
  listThoughts: ObMcpClient["listThoughts"];
  thoughtStats: ObMcpClient["thoughtStats"];
  memoryRecall: ObMcpClient["memoryRecall"];
  memoryWriteback: ObMcpClient["memoryWriteback"];
  classifyThought: ObMcpClient["classifyThought"];
  enrichThought: ObMcpClient["enrichThought"];
  panBrainDump: ObMcpClient["panBrainDump"];
  relatedThoughts: ObMcpClient["relatedThoughts"];
  updateThought: ObMcpClient["updateThought"];
  applyClassification: ObMcpClient["applyClassification"];
  applyEnrichment: ObMcpClient["applyEnrichment"];
  applySplit: ObMcpClient["applySplit"];
  listProjects: ObMcpClient["listProjects"];
  createProject: ObMcpClient["createProject"];
  close: ObMcpClient["close"];
}
