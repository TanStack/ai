import { createMCPClient } from '../client'
import type {
  McpAppCallRequest,
  McpServerDescriptor,
  McpSessionStore,
} from './session-store'
import type { ServerTool } from '@tanstack/ai'

/**
 * The UNPREFIXED, server-native tool name for an exposed ServerTool.
 * ai-mcp stamps it on `metadata.mcp.serverToolName`; falls back to `name`
 * (unprefixed clients) when absent. `metadata` is `Record<string, unknown>`,
 * so narrow each hop instead of asserting a shape.
 */
function serverToolNameOf(tool: ServerTool): string {
  const mcp = tool.metadata?.mcp
  if (mcp !== null && typeof mcp === 'object' && 'serverToolName' in mcp) {
    const native: unknown = mcp.serverToolName
    if (typeof native === 'string') return native
  }
  return tool.name
}

export interface McpAppCallHandlerOptions {
  /** Static server map — the default, serverless-safe path. */
  servers?: Record<string, McpServerDescriptor>
  /** Opt-in dynamic/stateful resolution (e.g. inMemoryMcpSessionStore). Wins over `servers`. */
  store?: McpSessionStore
  /** Authorize a call. Default: allow only tools the server actually exposes. */
  allowTool?: (req: McpAppCallRequest) => boolean | Promise<boolean>
}

/**
 * Creates a server-side handler that resolves an MCP server descriptor,
 * reconnects per-call (stateless/serverless-safe), enforces a same-server
 * allowlist, and proxies `callTool` to the underlying MCP server.
 *
 * Always closes the client in `finally`. Never returns transport config to the caller.
 */
export function createMcpAppCallHandler(opts: McpAppCallHandlerOptions) {
  return async (
    req: McpAppCallRequest,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> => {
    // Resolve server descriptor — store wins over static map.
    // When serverId is undefined and exactly one server is configured, default
    // to that sole server; with multiple servers, undefined stays unresolvable.
    let descriptor: McpServerDescriptor | null
    if (opts.store) {
      descriptor = await opts.store.get(req.threadId, req.serverId)
    } else if (req.serverId !== undefined) {
      descriptor = opts.servers?.[req.serverId] ?? null
    } else {
      const entries = Object.entries(opts.servers ?? {})
      descriptor = entries.length === 1 ? (entries[0]?.[1] ?? null) : null
    }

    if (!descriptor) {
      // serverId omitted but resolution was ambiguous (zero or multiple
      // servers configured) → clearer message than "Unknown serverId: undefined".
      const error =
        req.serverId === undefined
          ? 'No serverId provided and zero or multiple servers configured; specify serverId'
          : `Unknown serverId: ${req.serverId}`
      return { ok: false, error }
    }

    const client = await createMCPClient({
      transport: descriptor.transport,
      prefix: descriptor.prefix,
    })

    try {
      // The widget sends the server-native (UNPREFIXED) tool name
      // (`UIResourcePart.toolName` is the native name), so we match it directly
      // against the native names the server exposes — carried on
      // `metadata.mcp.serverToolName` (falling back to `name` for unprefixed
      // clients) — and forward `req.toolName` unchanged to `client.callTool`.
      const exposedNative = new Set(
        (await client.tools()).map((t) => serverToolNameOf(t)),
      )
      const inExposed = exposedNative.has(req.toolName)
      const customOk = opts.allowTool ? await opts.allowTool(req) : true

      if (!inExposed || !customOk) {
        return { ok: false, error: `Tool not allowed: ${req.toolName}` }
      }

      const args =
        req.args !== null &&
        typeof req.args === 'object' &&
        !Array.isArray(req.args)
          ? (req.args as Record<string, unknown>)
          : {}
      const result = await client.callTool(req.toolName, args)
      return { ok: true, result }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'MCP call failed',
      }
    } finally {
      await client.close().catch(() => undefined)
    }
  }
}
