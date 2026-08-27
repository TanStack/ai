import type { ClientOptions } from '@modelcontextprotocol/sdk/client/index.js'
import type { TransportConfig } from '../transport'

export interface McpServerDescriptor {
  transport: TransportConfig | undefined
  prefix?: string
  clientOptions?: ClientOptions
}

export interface McpSessionStore {
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
  serverId?: string
  toolName: string
  args?: unknown
  messageId?: string
}

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
      // Opportunistic sweep: reclaim every expired entry, not just this thread,
      // so set-but-never-read threads can't accumulate unbounded.
      const now = Date.now()
      for (const [id, e] of map) {
        if (now - e.at > ttl) map.delete(id)
      }
      map.set(threadId, { at: now, servers })
    },
    async get(threadId, serverId) {
      const e = map.get(threadId)
      if (!e) {
        map.delete(threadId)
        return null
      }
      if (Date.now() - e.at > ttl) {
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
