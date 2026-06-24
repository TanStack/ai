import type { MCPClientOptions } from '../types'

export interface McpServerDescriptor {
  transport: MCPClientOptions['transport']
  prefix?: string
}

export interface McpSessionStore {
  /** Resolve the server descriptor for a thread+serverId, or null if unknown. */
  get: (
    threadId: string,
    serverId: string,
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
  serverId: string
  toolName: string
  args?: unknown
  messageId?: string
}

/**
 * Creates a simple in-memory McpSessionStore.
 *
 * TTL is enforced on read (prune-on-read) — this is single-instance only and
 * is shaped to match PR #785's store seams so SQL backends can drop in later
 * with no API change.
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
      return e.servers[serverId] ?? null
    },
  }
}
