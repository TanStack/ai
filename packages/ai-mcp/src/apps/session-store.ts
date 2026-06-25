import type { TransportConfig } from '../transport'

export interface McpServerDescriptor {
  /**
   * The serializable connection config the call handler reconnects from.
   * `undefined` for a client built from a ready-made `Transport` instance
   * (single-use, not reconnectable) — the handler rejects such a call with a
   * clear error.
   */
  transport: TransportConfig | undefined
  prefix?: string
}

export interface McpSessionStore {
  /**
   * Resolve the server descriptor for a thread+serverId, or null if unknown.
   *
   * `serverId` may be undefined when the widget omits it (single-server setups);
   * implementations should default to the sole recorded server in that case.
   */
  get: (
    threadId: string,
    serverId: string | undefined,
  ) => Promise<McpServerDescriptor | null>
  /** Record the servers a thread may interact with (called from the chat route). */
  set: (
    threadId: string,
    servers: Record<string, McpServerDescriptor>,
  ) => Promise<void>
}

/** Call-handler request shape; imported by call-handler.ts from this module. */
export interface McpAppCallRequest {
  threadId: string
  /**
   * The server the widget targets. May be undefined when the widget omits it
   * (single-server setups) — the handler defaults to the sole configured server.
   */
  serverId?: string
  toolName: string
  args?: unknown
  /**
   * Reserved — forwarded by the bridge for correlation purposes but not
   * consumed by the call handler. Mirrors the `meta` convention: accepted
   * on the wire, carried through, but the handler does not read it.
   */
  messageId?: string
}

/**
 * Creates a simple in-memory McpSessionStore.
 *
 * TTL is enforced on read (prune-on-read) and slides on each successful hit —
 * this is single-instance only. The `McpSessionStore` interface is the
 * extension point for persistent/SQL backends, which can drop in later with no
 * API change.
 */
export function inMemoryMcpSessionStore(
  opts: { ttlMs?: number } = {},
): McpSessionStore {
  const map = new Map<
    string,
    { at: number; servers: Record<string, McpServerDescriptor> }
  >()
  const ttl = opts.ttlMs ?? 30 * 60_000

  return {
    async set(threadId, servers) {
      map.set(threadId, { at: Date.now(), servers })
    },
    async get(threadId, serverId) {
      const e = map.get(threadId)
      if (!e || Date.now() - e.at > ttl) {
        map.delete(threadId)
        return null
      }
      // Sliding TTL: refresh on a successful hit so an actively-used thread
      // doesn't expire by absolute time mid-session.
      e.at = Date.now()
      // serverId omitted (single-server setups): default to the sole server.
      if (serverId === undefined) {
        const entries = Object.entries(e.servers)
        return entries.length === 1 ? (entries[0]?.[1] ?? null) : null
      }
      return e.servers[serverId] ?? null
    },
  }
}
