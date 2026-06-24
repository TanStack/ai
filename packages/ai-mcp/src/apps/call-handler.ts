import { createMCPClient } from '../client'
import type {
  McpAppCallRequest,
  McpServerDescriptor,
  McpSessionStore,
} from './session-store'

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
    // Resolve server descriptor — store wins over static map
    const descriptor = opts.store
      ? await opts.store.get(req.threadId, req.serverId)
      : (opts.servers?.[req.serverId] ?? null)

    if (!descriptor) {
      return { ok: false, error: `Unknown serverId: ${req.serverId}` }
    }

    const client = await createMCPClient({
      transport: descriptor.transport,
      prefix: descriptor.prefix,
    })

    try {
      // Enforce same-server allowlist: tool must be exposed by this server
      const exposedNames = new Set((await client.tools()).map((t) => t.name))
      const inExposed = exposedNames.has(req.toolName)
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
