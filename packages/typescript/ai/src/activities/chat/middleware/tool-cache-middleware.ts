import type { ChatMiddleware } from './types'

/**
 * A cache entry stored by the tool cache middleware.
 */
export interface ToolCacheEntry {
  result: unknown
  timestamp: number
}

/**
 * Custom storage backend for the tool cache middleware.
 *
 * When provided, the middleware delegates all cache operations to this storage
 * instead of using the built-in in-memory Map. This enables external storage
 * backends like Redis, localStorage, databases, etc.
 *
 * All methods may return a Promise for async storage backends.
 */
export interface ToolCacheStorage {
  getItem: (
    key: string,
  ) => ToolCacheEntry | undefined | Promise<ToolCacheEntry | undefined>
  setItem: (key: string, value: ToolCacheEntry) => void | Promise<void>
  deleteItem: (key: string) => void | Promise<void>
}

/**
 * Options for the tool cache middleware.
 */
export interface ToolCacheMiddlewareOptions {
  /**
   * Maximum number of entries in the cache.
   * When exceeded, the oldest entry is evicted (LRU).
   *
   * Only applies to the default in-memory storage.
   * When a custom `storage` is provided, capacity management is the storage's responsibility.
   *
   * @default 100
   */
  maxSize?: number

  /**
   * Time-to-live in milliseconds. Entries older than this are not served from cache.
   * @default Infinity (no expiry)
   */
  ttl?: number

  /**
   * Tool names to cache. If not provided, all tools are cached.
   */
  toolNames?: Array<string>

  /**
   * Custom function to generate a cache key from tool name and args.
   * Defaults to `JSON.stringify([toolName, args])`.
   */
  keyFn?: (toolName: string, args: unknown) => string

  /**
   * Custom storage backend. When provided, the middleware uses this instead of
   * the built-in in-memory Map. The storage is responsible for its own capacity
   * management — the `maxSize` option is ignored.
   *
   * @example
   * ```ts
   * toolCacheMiddleware({
   *   storage: {
   *     getItem: (key) => redisClient.get(key).then(v => v ? JSON.parse(v) : undefined),
   *     setItem: (key, value) => redisClient.set(key, JSON.stringify(value)),
   *     deleteItem: (key) => redisClient.del(key),
   *   },
   * })
   * ```
   */
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

/**
 * Creates a middleware that caches tool call results based on tool name + arguments.
 *
 * When a tool is called with the same name and arguments as a previous call,
 * the cached result is returned immediately without executing the tool.
 *
 * @example
 * ```ts
 * import { chat, toolCacheMiddleware } from '@tanstack/ai'
 *
 * const stream = chat({
 *   adapter,
 *   messages,
 *   tools: [weatherTool, stockTool],
 *   middleware: [
 *     toolCacheMiddleware({ ttl: 60_000, toolNames: ['getWeather'] }),
 *   ],
 * })
 * ```
 */
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
      if (toolNames && !toolNames.includes(hookCtx.toolName)) {
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
      if (toolNames && !toolNames.includes(info.toolName)) return

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
