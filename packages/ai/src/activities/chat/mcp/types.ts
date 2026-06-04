import type { ServerTool } from '../tools/tool-definition'

/**
 * Minimal structural shape that `chat({ mcp })` needs from an MCP client.
 *
 * `@tanstack/ai-mcp`'s `MCPClient` and `MCPClients` satisfy this interface by
 * shape — the core `@tanstack/ai` package does NOT import `@tanstack/ai-mcp`
 * (ai-mcp depends on ai, not the reverse).
 */
export interface MCPToolSource {
  tools: (options?: { lazy?: boolean }) => Promise<Array<ServerTool>>
  close: () => Promise<void>
}

/**
 * Controls what happens to MCP connections after tool discovery.
 *
 * - `'close'` (default) — connections are closed after tools are discovered.
 * - `'keep-alive'` — connections are kept open for the duration of the chat call.
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
   * Connection lifecycle policy applied to all clients after tool discovery.
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
   * Called when tool discovery fails for a single source.
   *
   * - Throw (or re-throw) from this handler to fail the entire chat call fast.
   * - Return normally to skip that source and continue with remaining clients.
   * - Omit this handler entirely to rethrow the error (fail-fast by default).
   */
  onDiscoveryError?: (error: unknown, source: MCPToolSource) => void
}
