import type { ChatMiddleware } from './types'

export interface ToolCacheEntry {
  result: unknown
  timestamp: number
}

export interface ToolCacheStorage {
  getItem: (
    key: string,
  ) => ToolCacheEntry | undefined | Promise<ToolCacheEntry | undefined>
  setItem: (key: string, value: ToolCacheEntry) => void | Promise<void>
  deleteItem: (key: string) => void | Promise<void>
}

export interface ToolCacheMiddlewareOptions {
  maxSize?: number

  ttl?: number

  toolNames?: Array<string>

  keyFn?: (toolName: string, args: unknown) => string

  storage?: ToolCacheStorage
}

function defaultKeyFn(toolName: string, args: unknown): string {
  return JSON.stringify([toolName, args])
}

function createDefaultStorage(maxSize: number): ToolCacheStorage {
  const cache = new Map<string, ToolCacheEntry>()

  return {
    getItem: (key) => {
      const entry = cache.get(key)
      if (entry !== undefined) {
        // Refresh recency: delete and re-insert so this key becomes newest
        cache.delete(key)
        cache.set(key, entry)
      }
      return entry
    },
    setItem: (key, value) => {
      // Delete first so re-inserts also refresh recency
      if (cache.has(key)) {
        cache.delete(key)
      } else if (cache.size >= maxSize) {
        // LRU eviction: Map iteration order is insertion order — first key is least recently used
        const firstKey = cache.keys().next().value
        if (firstKey !== undefined) {
          cache.delete(firstKey)
        }
      }
      cache.set(key, value)
    },
    deleteItem: (key) => {
      cache.delete(key)
    },
  }
}

export function toolCacheMiddleware(
  options: ToolCacheMiddlewareOptions = {},
): ChatMiddleware {
  const {
    maxSize = 100,
    ttl = Infinity,
    toolNames,
    keyFn = defaultKeyFn,
    storage = createDefaultStorage(maxSize),
  } = options

  return {
    name: 'tool-cache-middleware',

    onBeforeToolCall: async (_ctx, hookCtx) => {
      const hasToolNames = toolNames && !toolNames.includes(hookCtx.toolName)
      if (hasToolNames) {
        return undefined
      }

      const key = keyFn(hookCtx.toolName, hookCtx.args)
      const entry = await storage.getItem(key)

      if (entry) {
        const age = Date.now() - entry.timestamp
        if (age < ttl) {
          return { type: 'skip', result: entry.result }
        }
        // Expired — remove
        await storage.deleteItem(key)
      }

      return undefined
    },

    onAfterToolCall: async (_ctx, info) => {
      if (!info.ok) return
      const hasToolNames = toolNames && !toolNames.includes(info.toolName)
      if (hasToolNames) return

      // Re-derive the key from the raw arguments to match what onBeforeToolCall produces
      let parsedArgs: unknown
      try {
        parsedArgs = JSON.parse(info.toolCall.function.arguments.trim() || '{}')
      } catch {
        return
      }

      const key = keyFn(info.toolName, parsedArgs)

      await storage.setItem(key, {
        result: info.result,
        timestamp: Date.now(),
      })
    },
  }
}
