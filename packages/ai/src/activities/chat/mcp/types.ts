import type { AnyServerTool } from '../tools/tool-definition'
import type { ContentPart, ModelMessage } from '../../../types'

/**
 * The shape `readResource` resolves to — a structural subset of MCP's
 * `ReadResourceResult`. Single source of truth shared by
 * `MCPToolSource.readResource` (this file) and the tool-bound
 * `McpToolAppMeta.readResource` (tool-calls.ts) so the two copies cannot drift.
 */
export interface McpResourceReadResult {
  contents: Array<{
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }>
}

/**
 * The MCP request that an `MCPRequestMeta` hook is about to send.
 *
 * - `tools/call`: `toolName` is the server name of the tool (no prefix).
 * - `resources/read`: `uri` is the resource that is read.
 *
 * `serverId` is the client prefix, or `undefined` when the client has none.
 */
export type MCPRequestMetaInput =
  | {
      method: 'tools/call'
      serverId: string | undefined
      toolName: string
      args: Record<string, unknown>
    }
  | { method: 'resources/read'; serverId: string | undefined; uri: string }

/**
 * Gives the `_meta` for one MCP request.
 *
 * The hook runs once for each MCP request, when the request executes. Its
 * result is sent as the request `_meta`. Return `undefined` to send no
 * `_meta`. `@tanstack/ai-mcp` drops the keys that MCP reserves
 * (`progressToken` and the `io.modelcontextprotocol/` style prefixes).
 *
 * If the hook throws or rejects, that one request fails with the error.
 */
export type MCPRequestMeta = (
  request: MCPRequestMetaInput,
) =>
  | Record<string, unknown>
  | undefined
  | Promise<Record<string, unknown> | undefined>

/**
 * Minimal structural shape that `chat({ mcp })` needs from an MCP client.
 *
 * `@tanstack/ai-mcp`'s `MCPClient` and `MCPClients` satisfy this interface by
 * shape — the core `@tanstack/ai` package does NOT import `@tanstack/ai-mcp`
 * (ai-mcp depends on ai, not the reverse).
 */
export interface MCPToolSource {
  // Keep the options shape in sync with ai-mcp's `ToolsOptions` — extra
  // optional fields added there still match structurally, but chat() only
  // forwards what is declared here.
  /**
   * Lists the tools. `chat()` passes the run's `signal` so that a cancelled
   * run also cancels discovery. A source that ignores `signal` still works.
   * `chat()` passes `requestMeta` only when the caller set it.
   */
  tools: (options?: {
    lazy?: boolean
    signal?: AbortSignal
    requestMeta?: MCPRequestMeta
  }) => Promise<Array<AnyServerTool>>
  close: () => Promise<void>
  /**
   * Reads an MCP resource by URI. Used by the chat manager to eagerly fetch
   * `ui://` resource widgets (MCP Apps) after a tool result resolves, and to
   * resolve `attachResources`.
   *
   * `options.serverId` is the server that owns the tool. `options.meta` is
   * the `_meta` to send with the read.
   *
   * Optional — sources that do not serve resources need not implement this.
   */
  readResource?: (
    uri: string,
    options?: { serverId?: string; meta?: Record<string, unknown> },
  ) => Promise<McpResourceReadResult>
  /**
   * Lists concrete resources. Used by `attachResources: { auto: true }`.
   * `@tanstack/ai-mcp`'s client exposes this as `resources()` — both names
   * are accepted.
   */
  listResources?: (options?: {
    signal?: AbortSignal
  }) => Promise<Array<{ uri: string; name?: string; mimeType?: string }>>
  /** Alias of `listResources` used by `MCPClient.resources()`. */
  resources?: (options?: {
    signal?: AbortSignal
  }) => Promise<Array<{ uri: string; name?: string; mimeType?: string }>>
  /**
   * Lists prompt templates. Used when resolving `prompts` by name across
   * clients that expose `getPrompt`.
   */
  listPrompts?: (options?: {
    signal?: AbortSignal
  }) => Promise<Array<{ name: string; description?: string }>>
  /** Alias of `listPrompts` used by `MCPClient.prompts()`. */
  prompts?: (options?: {
    signal?: AbortSignal
  }) => Promise<Array<{ name: string; description?: string }>>
  /**
   * Renders one prompt template into MCP messages.
   */
  getPrompt?: (
    name: string,
    args?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<{
    messages: Array<{
      role: string
      content?: { type: string; text?: string } | null
    }>
  }>
}

/**
 * Controls what happens to MCP connections when the chat run ends.
 *
 * - `'close'` (default) — `chat()` closes each connection when the run ends
 *   (after the agent loop completes and the stream is drained), so tools can
 *   still execute throughout the run.
 * - `'keep-alive'` — `chat()` never closes the connections; the caller owns
 *   their lifecycle (e.g. keep them warm across requests).
 */
export type MCPConnectionPolicy = 'close' | 'keep-alive'

/**
 * Attach MCP resources as multimodal ContentParts before the model turn.
 *
 * - `{ uris }` — read these URIs (tried on every source that has `readResource`)
 * - `{ auto }` — list resources and take the first `max` (default 8)
 */
export type ChatMCPAttachResources =
  | { uris: ReadonlyArray<string> }
  | { auto: true; max?: number }

/** One MCP prompt to resolve and prepend to the conversation. */
export type ChatMCPPromptRef = {
  name: string
  args?: Record<string, unknown>
}

export type ChatMCPPrompt = ChatMCPPromptRef | Array<ChatMCPPromptRef>

/**
 * Options controlling MCP tool discovery and lifecycle for a `chat()` call.
 */
export interface ChatMCPOptions {
  /**
   * The MCP clients or client pools to discover tools from and manage.
   */
  clients: Array<MCPToolSource>

  /**
   * Connection lifecycle policy applied to all clients when the run ends.
   *
   * Defaults to `'close'`.
   */
  connection?: MCPConnectionPolicy

  /**
   * When `true`, tool schemas are fetched lazily (forwarded to
   * `tools({ lazy: true })`).
   *
   * Defaults to `false`.
   */
  lazyTools?: boolean

  /**
   * Cap how many MCP tools are offered eagerly. The rest are marked `lazy`
   * so {@link LazyToolManager} / discovery can load them on demand.
   * When `lazyTools` is already true, this still caps the catalog size by
   * keeping only the top `maxTools` names in the lazy set offered first —
   * remainder stay lazy behind the discovery tool.
   */
  maxTools?: number

  /**
   * Rank tools before applying `maxTools`.
   *
   * - `'annotation'` — prefer `readOnlyHint` / non-`destructiveHint` tools
   *   (from `metadata.mcp.annotations`)
   * - function — higher score first
   *
   * Default: discovery order.
   */
  rankTools?: 'annotation' | ((tool: AnyServerTool) => number)

  /**
   * Inject MCP resources as ContentParts onto the last user message (or a
   * new user message when the list has no user turn).
   */
  attachResources?: ChatMCPAttachResources

  /**
   * Resolve MCP prompts and prepend their messages to the conversation.
   */
  prompts?: ChatMCPPrompt

  /**
   * Options for converting resource blobs to multimodal parts.
   */
  resourcePartOptions?: {
    maxBytes?: number
    onReject?: 'placeholder' | 'omit' | 'throw'
  }

  /**
   * Gives the `_meta` for each MCP request in this chat run. It covers tool
   * calls and the MCP Apps `ui://` resource reads.
   *
   * The hook runs when the request executes, not at discovery. Meta is not
   * part of the tool cache key: a `toolCacheMiddleware` hit sends no request,
   * so the hook does not run.
   */
  requestMeta?: MCPRequestMeta

  /**
   * Called when tool discovery fails for a single source.
   *
   * - Throw (or re-throw) from this handler to fail the entire chat call fast.
   * - Return normally to skip that source and continue with remaining clients.
   * - Omit this handler entirely to rethrow the error (fail-fast by default).
   *
   * Async handlers are awaited, so a rejected promise also fails fast.
   */
  onDiscoveryError?: (
    error: unknown,
    source: MCPToolSource,
  ) => void | Promise<void>
}

/** Context resolved from `attachResources` / `prompts` for one chat run. */
export type ChatMCPResolvedContext = {
  promptMessages: Array<ModelMessage>
  contentParts: Array<ContentPart>
}
