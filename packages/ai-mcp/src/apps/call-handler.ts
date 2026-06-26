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

/**
 * The UNPREFIXED, server-native tool name for an exposed ServerTool.
 * ai-mcp stamps it on `metadata.mcp.serverToolName`; the `name` fallback is a
 * defensive last resort — auto-discovery (`toServerTools`) and the explicit
 * `tools(defs)` path both always stamp `serverToolName`, so this fallback is
 * only reached for hand-built ServerTools. `metadata` is
 * `Record<string, unknown>`, so narrow each hop instead of asserting a shape.
 */
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
  /**
   * Opt-in dynamic/stateful resolution (e.g. inMemoryMcpSessionStore). When
   * provided, the store WINS for any thread+serverId it has an entry for; on a
   * store miss (null) the handler falls back to the static `clients` registry.
   * So `clients` is always the base and the store is an override on top.
   */
  store?: McpSessionStore
  /**
   * Additional per-call authorizer. The server-exposure check is ALWAYS
   * enforced first (any tool the server does not expose is rejected). When
   * `allowTool` is provided, a request must satisfy BOTH — it is AND-ed on
   * top of the server-exposure check, not a replacement for it.
   */
  allowTool?: (req: McpAppCallRequest) => boolean | Promise<boolean>
  /**
   * Optional server-side observability hook. The handler is otherwise opaque on
   * failure — it returns a fail-soft `{ ok: false, error }` to the (untrusted)
   * widget and logs nothing, so on a serverless backend there is no trace of
   * WHY a proxied call failed. `onError` is invoked (and awaited if async) with
   * the caught error and the originating request before that result is
   * returned. `phase` distinguishes a `'call'` failure (connect/exposure
   * lookup/execution/serialization) from a `'close'` failure (per-call client
   * cleanup, which is swallowed and never affects the result). This library
   * never writes to `console`; wire your logger here to capture failures.
   */
  onError?: (
    error: unknown,
    info: { phase: 'call' | 'close'; req: McpAppCallRequest },
  ) => void | Promise<void>
}

/** Structurally distinguish a pool (has getServers) from a single client. */
function isPool(entry: MCPClient | MCPClients): entry is MCPClients {
  return 'getServers' in entry
}

/**
 * The flattened view of the `clients` input used to resolve a `serverId` to a
 * descriptor.
 *
 * - `byServerId` keys every addressable descriptor by its `prefix` — the exact
 *   value the widget sends as `serverId` (the client/pool stamps it on
 *   `metadata.mcp.serverId`, which equals `prefix`).
 * - `fallback` holds the single descriptor that has no addressable prefix
 *   (undefined/empty). It is reachable ONLY via the sole-server default path
 *   (serverId omitted + exactly one descriptor in total).
 * - `total` is the count of all descriptors across both, used to decide the
 *   sole-server default.
 */
interface AppRegistry {
  byServerId: Record<string, McpServerDescriptor>
  fallback: McpServerDescriptor | null
  total: number
}

/**
 * Flatten the `clients` input into a registry keyed UNIFORMLY by `prefix` (the
 * value the widget sends as `serverId`). A pool contributes one entry per
 * configured server (keyed by that server's `prefix`, NOT its config key); a
 * single client is keyed by `getInfo().prefix`. Entries whose `prefix` is
 * undefined/empty have no addressable serverId and go in the `fallback` slot
 * (reachable only by the sole-server default).
 *
 * Throws at handler-construction time if two entries resolve to the same
 * non-empty prefix, or if more than one entry has an undefined/empty prefix —
 * either case makes `serverId` routing ambiguous, so it must not silently
 * overwrite.
 */
function buildRegistry(clients: McpAppClientsInput): AppRegistry {
  const entries = Array.isArray(clients) ? clients : [clients]
  const byServerId: Record<string, McpServerDescriptor> = {}
  let fallback: McpServerDescriptor | null = null
  let total = 0

  const add = (info: {
    transport: McpServerDescriptor['transport']
    prefix: string | undefined
  }) => {
    const descriptor: McpServerDescriptor = {
      transport: info.transport,
      prefix: info.prefix,
    }
    total += 1
    const key = info.prefix
    if (key === undefined || key === '') {
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
      for (const info of Object.values(entry.getServers())) {
        add(info)
      }
    } else {
      add(entry.getInfo())
    }
  }
  return { byServerId, fallback, total }
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

  // Resolve a serverId against the static `clients` registry. When serverId is
  // undefined and exactly one descriptor is registered, default to that sole
  // descriptor; with zero or multiple, undefined stays unresolvable.
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
    // Resolve server descriptor. The store WINS when it has an entry; otherwise
    // we fall back to the static `clients` registry (the base). A store miss
    // (null) must not reject when the registry can serve the request.
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

      // Reject a malformed args payload (array, primitive, null) rather than
      // silently coercing it to {} — a bad widget request should fail loudly
      // instead of executing the tool with defaults. Absent args is valid.
      const args = req.args === undefined ? {} : req.args
      if (!isArgsRecord(args)) {
        return { ok: false, error: 'Invalid args: expected an object' }
      }
      const result = await client.callTool(req.toolName, args)
      return { ok: true, result }
    } catch (err) {
      // Surface the failure for server-side observability before flattening it
      // into the opaque wire error; never let the hook itself break the result.
      await Promise.resolve(opts.onError?.(err, { phase: 'call', req })).catch(
        () => undefined,
      )
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'MCP call failed',
      }
    } finally {
      // Per-call reconnect handler closes its client every call; a consistently
      // failing close leaks handles silently. Don't rethrow (it would mask the
      // real result), but report it through the same hook.
      await client
        .close()
        .catch((err: unknown) =>
          Promise.resolve(opts.onError?.(err, { phase: 'close', req })).catch(
            () => undefined,
          ),
        )
    }
  }
}
