import { createMCPClient } from '../client'
import type { MCPClient } from '../client'
import type { MCPClients } from '../pool'
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
/** Type guard: a plain (non-array) object usable as a tool-args record. */
function isArgsRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function serverToolNameOf(tool: ServerTool): string {
  const mcp = tool.metadata?.mcp
  if (mcp !== null && typeof mcp === 'object' && 'serverToolName' in mcp) {
    const native: unknown = mcp.serverToolName
    if (typeof native === 'string') return native
  }
  return tool.name
}

/**
 * A single MCP client or a pool of clients (or an array of either). These are
 * the same client/pool instances created with `createMCPClient` /
 * `createMCPClients` and passed to `chat({ mcp: { clients: [...] } })`. The
 * handler reads each client's connection descriptor via `getInfo()` /
 * `getServers()` so it can reconnect per-call without a separate config map.
 */
export type McpAppClientsInput =
  | MCPClient
  | MCPClients
  | Array<MCPClient | MCPClients>

export interface McpAppCallHandlerOptions {
  /**
   * The MCP client(s) to serve widget tool calls for — the same instances you
   * pass to `chat({ mcp: { clients } })`. Accepts a single client, a pool, or
   * an array of either. The handler reads each one's connection descriptor and
   * reconnects per-call (stateless/serverless-safe).
   */
  clients: McpAppClientsInput
  /** Opt-in dynamic/stateful resolution (e.g. inMemoryMcpSessionStore). Wins over `clients`. */
  store?: McpSessionStore
  /**
   * Additional per-call authorizer. The server-exposure check is ALWAYS
   * enforced first (any tool the server does not expose is rejected). When
   * `allowTool` is provided, a request must satisfy BOTH — it is AND-ed on
   * top of the server-exposure check, not a replacement for it.
   */
  allowTool?: (req: McpAppCallRequest) => boolean | Promise<boolean>
}

/** Structurally distinguish a pool (has getServers) from a single client. */
function isPool(entry: MCPClient | MCPClients): entry is MCPClients {
  return 'getServers' in entry
}

/**
 * Flatten the `clients` input into a registry keyed by serverId. A pool
 * contributes one entry per configured server (keyed by its config key); a
 * single client is registered under its `getInfo().prefix`, or — when it has
 * no prefix — under the empty-string key (the sole unnamed entry).
 */
function buildRegistry(
  clients: McpAppClientsInput,
): Record<string, McpServerDescriptor> {
  const entries = Array.isArray(clients) ? clients : [clients]
  const registry: Record<string, McpServerDescriptor> = {}
  for (const entry of entries) {
    if (isPool(entry)) {
      for (const [serverId, info] of Object.entries(entry.getServers())) {
        registry[serverId] = { transport: info.transport, prefix: info.prefix }
      }
    } else {
      const info = entry.getInfo()
      const serverId = info.prefix ?? ''
      registry[serverId] = { transport: info.transport, prefix: info.prefix }
    }
  }
  return registry
}

/**
 * Creates a server-side handler that resolves an MCP server descriptor from the
 * provided client(s), reconnects per-call (stateless/serverless-safe), enforces
 * a same-server allowlist, and proxies `callTool` to the underlying MCP server.
 *
 * Always closes the per-call client in `finally`. Never returns transport config.
 */
export function createMcpAppCallHandler(opts: McpAppCallHandlerOptions) {
  const registry = buildRegistry(opts.clients)

  return async (
    req: McpAppCallRequest,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> => {
    // Resolve server descriptor — store wins over the registry.
    // When serverId is undefined and exactly one server is registered, default
    // to that sole server; with multiple servers, undefined stays unresolvable.
    let descriptor: McpServerDescriptor | null
    if (opts.store) {
      descriptor = await opts.store.get(req.threadId, req.serverId)
    } else if (req.serverId !== undefined) {
      descriptor = registry[req.serverId] ?? null
    } else {
      const entries = Object.entries(registry)
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

    if (descriptor.transport === undefined) {
      // Client was built from a raw Transport instance (no reconnectable
      // descriptor), so there is nothing to reconnect per-call.
      return {
        ok: false,
        error: 'MCP client has no reconnectable transport descriptor',
      }
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

      const args = isArgsRecord(req.args) ? req.args : {}
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
