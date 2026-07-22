import {
  inspectRecords,
  isExpired,
  listRecordFacts,
  recallRecords,
  saveTurn,
} from '../../internal/store'
import type {
  BuiltinOptions,
  MemoryRecord,
  RecordStore,
} from '../../internal/store'
import type { MemoryAdapter, MemoryScope } from '../../types'

/**
 * Minimal subset of the Redis client API the adapter uses. Shaped to match
 * `ioredis` directly (lowercase method names). For node-redis v4+'s camelCase
 * API, wrap the client with {@link nodeRedisAsRedisLike}.
 */
export interface RedisLike {
  set: (key: string, value: string) => Promise<unknown>
  get: (key: string) => Promise<string | null>
  del: (...keys: Array<string>) => Promise<unknown>
  sadd: (key: string, ...members: Array<string>) => Promise<unknown>
  srem: (key: string, ...members: Array<string>) => Promise<unknown>
  smembers: (key: string) => Promise<Array<string>>
  mget: (...keys: Array<string>) => Promise<Array<string | null>>
}

/** node-redis v4+ default-mode (camelCase) surface used by {@link nodeRedisAsRedisLike}. */
export interface NodeRedisLike {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<unknown>
  del: (keys: Array<string> | string) => Promise<number>
  sAdd: (key: string, members: string | Array<string>) => Promise<number>
  sRem: (key: string, members: string | Array<string>) => Promise<number>
  sMembers: (key: string) => Promise<Array<string>>
  mGet: (keys: Array<string>) => Promise<Array<string | null>>
}

/**
 * Wrap a node-redis v4+ default-mode client (camelCase API) into the lowercase
 * {@link RedisLike} shape this adapter expects. For `ioredis`, no wrapper is
 * needed — pass the client directly.
 */
export function nodeRedisAsRedisLike(client: NodeRedisLike): RedisLike {
  return {
    get: (key) => client.get(key),
    set: (key, value) => client.set(key, value),
    del: (...keys) => client.del(keys),
    sadd: (key, ...members) => client.sAdd(key, members),
    srem: (key, ...members) => client.sRem(key, members),
    smembers: (key) => client.sMembers(key),
    mget: (...keys) => client.mGet(keys),
  }
}

export interface RedisOptions extends BuiltinOptions {
  /** A Redis client implementing {@link RedisLike} (ioredis, or wrapped node-redis). */
  redis: RedisLike
  /** Key prefix. Defaults to `'tanstack-ai:memory'`. */
  prefix?: string
}

/**
 * Escape the `:` scope-key delimiter (and the `\` escape character itself) in a
 * scope value before composing the colon-joined key. Without this, a scope
 * value containing `:` could shift segment positions and collide two different
 * scopes' index buckets. `_` is escaped too so a literal `_` value can't collide
 * with the unset-key placeholder.
 */
function escapeScopeValue(value: string): string {
  return value.replace(/[\\:_]/g, '\\$&')
}

// Track ids we've warned about so ongoing corruption of DIFFERENT ids keeps
// surfacing, bounded so a pathological store can't spam the console forever.
const warnedMalformedIds = new Set<string>()
const MALFORMED_WARN_CAP = 100
function warnMalformedRow(id: string, err: unknown): void {
  if (
    warnedMalformedIds.has(id) ||
    warnedMalformedIds.size >= MALFORMED_WARN_CAP
  ) {
    return
  }
  warnedMalformedIds.add(id)
  console.warn(
    `[tanstack-ai-memory] redis: skipped malformed record JSON (id=${id}). ` +
      `The row is left in place (not deleted) in case it is recoverable. ` +
      `Reason: ${String(err)}`,
  )
}

/**
 * Production memory adapter backed by plain Redis (no vector index required).
 * Ranks client-side (lexical + optional cosine + recency + importance), so it's
 * suited to up to ~10k records per scope. Bring your own client (`ioredis`, or
 * node-redis wrapped with {@link nodeRedisAsRedisLike}).
 *
 * Storage model:
 * ```text
 * {prefix}:record:{id}                       -> JSON MemoryRecord
 * {prefix}:index:{userId or _}:{sessionId}   -> Set<id>
 * ```
 */
export function redis(options: RedisOptions): MemoryAdapter {
  const client = options.redis
  const prefix = options.prefix ?? 'tanstack-ai:memory'

  const scopeKey = (scope: MemoryScope): string =>
    `${escapeScopeValue(scope.userId != null && scope.userId !== '' ? scope.userId : '_')}:${escapeScopeValue(scope.sessionId)}`
  const indexKey = (scope: MemoryScope): string =>
    `${prefix}:index:${scopeKey(scope)}`
  const recordKey = (id: string): string => `${prefix}:record:${id}`

  const store: RecordStore = {
    async add(batch) {
      const now = Date.now()
      for (const r of batch) {
        const next: MemoryRecord = { ...r, updatedAt: now }
        await client.set(recordKey(r.id), JSON.stringify(next))
        await client.sadd(indexKey(r.scope), r.id)
      }
    },

    async loadScope(scope: MemoryScope) {
      const idx = indexKey(scope)
      const ids = await client.smembers(idx)
      if (ids.length === 0) return []
      const raws = await client.mget(...ids.map(recordKey))
      const out: Array<MemoryRecord> = []
      const stale: Array<string> = []
      for (let i = 0; i < raws.length; i++) {
        const raw = raws[i] as string | null
        const id = ids[i] as string
        if (!raw) {
          stale.push(id)
          continue
        }
        let record: MemoryRecord
        try {
          record = JSON.parse(raw) as MemoryRecord
        } catch (err) {
          // Malformed JSON is skipped, NOT swept — a parse failure isn't proof
          // the data is unrecoverable (truncated read, older schema, etc.).
          warnMalformedRow(id, err)
          continue
        }
        if (isExpired(record)) {
          stale.push(id)
          continue
        }
        out.push(record)
      }
      if (stale.length > 0) {
        await client.srem(idx, ...stale)
        await client.del(...stale.map(recordKey))
      }
      return out
    },
  }

  return {
    id: 'redis',
    recall: (scope, query) => recallRecords(store, scope, query, options),
    save: (scope, turn) => saveTurn(store, scope, turn, options),
    inspect: (scope) => inspectRecords(store, scope),
    listFacts: (scope) => listRecordFacts(store, scope),
  }
}
