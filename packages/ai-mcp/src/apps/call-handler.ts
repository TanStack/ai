import { createMCPClient } from '../client'
import type { MCPClient } from '../client'
import type { MCPClients } from '../pool'
import type {
  McpAppCallRequest,
  McpServerDescriptor,
  McpSessionStore,
} from './session-store'
import type { ServerTool } from '@tanstack/ai'

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

export type McpAppClientsInput =
  | MCPClient
  | MCPClients
  | Array<MCPClient | MCPClients>

export interface McpAppCallHandlerOptions {
  clients: McpAppClientsInput
  store?: McpSessionStore
  allowTool?: (req: McpAppCallRequest) => boolean | Promise<boolean>
  onError?: (
    error: unknown,
    info: { phase: 'call' | 'close'; req: McpAppCallRequest },
  ) => void | Promise<void>
}

/** Structurally distinguish a pool (has getServers) from a single client. */
function isPool(entry: MCPClient | MCPClients): entry is MCPClients {
  return 'getServers' in entry
}

interface AppRegistry {
  byServerId: Record<string, McpServerDescriptor>
  fallback: McpServerDescriptor | null
  total: number
}

function buildRegistry(clients: McpAppClientsInput): AppRegistry {
  const entries = Array.isArray(clients) ? clients : [clients]
  const byServerId: Record<string, McpServerDescriptor> = {}
  let fallback: McpServerDescriptor | null = null
  let total = 0

  const add = (info: {
    transport: McpServerDescriptor['transport']
    prefix: string | undefined
    clientOptions?: McpServerDescriptor['clientOptions']
  }) => {
    const descriptor: McpServerDescriptor = {
      transport: info.transport,
      prefix: info.prefix,
      ...(info.clientOptions ? { clientOptions: info.clientOptions } : {}),
    }
    total += 1
    const key = info.prefix
    if (key === undefined) {
      if (fallback !== null) {
        throw new Error(
          'createMcpAppCallHandler: multiple clients without a prefix; serverId routing is ambiguous',
        )
      }
      fallback = descriptor
      return
    }
    if (key === '') {
      if (fallback !== null) {
        throw new Error(
          'createMcpAppCallHandler: multiple clients without a prefix; serverId routing is ambiguous',
        )
      }
      fallback = descriptor
      return
    }
    if (key in byServerId) {
      throw new Error(`createMcpAppCallHandler: duplicate serverId "${key}"`)
    }
    byServerId[key] = descriptor
  }

  for (const entry of entries) {
    if (isPool(entry)) {
      const poolServers = Object.values(entry.getServers())
      for (const info of poolServers) {
        add(info)
      }
    } else {
      add(entry.getInfo())
    }
  }
  return { byServerId, fallback, total }
}

function reportError(
  onError: McpAppCallHandlerOptions['onError'],
  error: unknown,
  info: { phase: 'call' | 'close'; req: McpAppCallRequest },
): Promise<void> {
  if (!onError) return Promise.resolve()
  return Promise.resolve()
    .then(() => onError(error, info))
    .catch(() => undefined)
}

export function createMcpAppCallHandler(opts: McpAppCallHandlerOptions) {
  const registry = buildRegistry(opts.clients)

  const resolveFromRegistry = (
    serverId: string | undefined,
  ): McpServerDescriptor | null => {
    if (serverId !== undefined) {
      return registry.byServerId[serverId] ?? null
    }
    if (registry.total !== 1) return null
    return registry.fallback ?? Object.values(registry.byServerId)[0] ?? null
  }

  return async (
    req: McpAppCallRequest,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> => {
    const descriptor =
      (opts.store ? await opts.store.get(req.threadId, req.serverId) : null) ??
      resolveFromRegistry(req.serverId)

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
      ...(descriptor.clientOptions
        ? { clientOptions: descriptor.clientOptions }
        : {}),
    })

    try {
      const exposedNative = new Set(
        (await client.tools()).map((t) => serverToolNameOf(t)),
      )
      const inExposed = exposedNative.has(req.toolName)
      const customOk = opts.allowTool ? await opts.allowTool(req) : true

      const toolBlocked = !inExposed || !customOk
      if (toolBlocked) {
        return { ok: false, error: `Tool not allowed: ${req.toolName}` }
      }

      const args = req.args === undefined ? {} : req.args
      if (!isArgsRecord(args)) {
        return { ok: false, error: 'Invalid args: expected an object' }
      }
      const result = await client.callTool(req.toolName, args)
      return { ok: true, result }
    } catch (err) {
      // Surface the failure for server-side observability before flattening it
      // into the opaque wire error; never let the hook itself break the result.
      await reportError(opts.onError, err, { phase: 'call', req })
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'MCP call failed',
      }
    } finally {
      await client
        .close()
        .catch((err: unknown) =>
          reportError(opts.onError, err, { phase: 'close', req }),
        )
    }
  }
}
