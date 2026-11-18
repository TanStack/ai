import type { AnyServerTool } from '../tools/tool-definition'

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
   * `ui://` resource widgets (MCP Apps) after a tool result resolves.
   *
   * `options.serverId` is the server that owns the tool. `options.meta` is
   * the `_meta` to send with the read.
   *
   * Optional — sources that do not serve `ui://` resources need not implement
   * this method. `ai-mcp`'s `MCPClient` satisfies this structurally.
   */
  readResource?: (
    uri: string,
    options?: { serverId?: string; meta?: Record<string, unknown> },
  ) => Promise<McpResourceReadResult>
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
