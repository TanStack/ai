import { defaultScoreHit, isExpired, scopeMatches } from '@tanstack/ai/memory'
import type {
  MemoryAdapter,
  MemoryListOptions,
  MemoryListResult,
  MemoryQuery,
  MemoryRecord,
  MemoryRecordPatch,
  MemoryScope,
  MemorySearchResult,
} from '@tanstack/ai/memory'

/**
 * Minimal subset of the Redis client API this adapter uses.
 * Compatible with both `redis` (node-redis v4+) and `ioredis` shapes.
 * Real users pass an instance of either.
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

export interface RedisMemoryAdapterOptions {
  redis: RedisLike
  /** Default 'tanstack-ai:memory'. */
  prefix?: string
}

const SCOPE_KEYS = [
  'tenantId',
  'userId',
  'sessionId',
  'threadId',
  'namespace',
] as const

export function redisMemoryAdapter(
  options: RedisMemoryAdapterOptions,
): MemoryAdapter {
  const prefix = options.prefix ?? 'tanstack-ai:memory'
  const redis = options.redis

  function scopeKey(scope: MemoryScope): string {
    return SCOPE_KEYS.map((k) => scope[k] ?? '_').join(':')
  }
  function indexKey(scope: MemoryScope): string {
    return `${prefix}:index:${scopeKey(scope)}`
  }
  function recordKey(id: string): string {
    return `${prefix}:record:${id}`
  }

  async function loadRecord(id: string): Promise<MemoryRecord | undefined> {
    const raw = await redis.get(recordKey(id))
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as MemoryRecord
    } catch {
      return undefined
    }
  }

  async function loadAllForScope(
    scope: MemoryScope,
  ): Promise<Array<MemoryRecord>> {
    const ids = await redis.smembers(indexKey(scope))
    if (ids.length === 0) return []
    const raws = await redis.mget(...ids.map(recordKey))
    const out: Array<MemoryRecord> = []
    const expired: Array<string> = []
    for (let i = 0; i < raws.length; i++) {
      const raw = raws[i] as string | null
      const id = ids[i] as string
      if (!raw) {
        expired.push(id)
        continue
      }
      try {
        const r = JSON.parse(raw) as MemoryRecord
        if (isExpired(r)) {
          expired.push(r.id)
          continue
        }
        if (!scopeMatches(r.scope, scope)) continue
        out.push(r)
      } catch {
        /* skip malformed */
      }
    }
    if (expired.length > 0) {
      await redis.srem(indexKey(scope), ...expired)
      await redis.del(...expired.map(recordKey))
    }
    return out
  }

  return {
    name: 'redis',

    async add(input) {
      const batch = Array.isArray(input) ? input : [input]
      const now = Date.now()
      for (const r of batch) {
        const next: MemoryRecord = { ...r, updatedAt: now }
        await redis.set(recordKey(r.id), JSON.stringify(next))
        await redis.sadd(indexKey(r.scope), r.id)
      }
    },

    async get(id, scope) {
      const r = await loadRecord(id)
      if (!r) return undefined
      if (isExpired(r)) {
        await redis.del(recordKey(id))
        await redis.srem(indexKey(r.scope), id)
        return undefined
      }
      if (!scopeMatches(r.scope, scope)) return undefined
      return r
    },

    async update(id, scope, patch: MemoryRecordPatch) {
      const r = await loadRecord(id)
      if (!r) return undefined
      if (isExpired(r)) {
        await redis.del(recordKey(id))
        await redis.srem(indexKey(r.scope), id)
        return undefined
      }
      if (!scopeMatches(r.scope, scope)) return undefined
      const next: MemoryRecord = {
        ...r,
        ...patch,
        id: r.id,
        scope: r.scope,
        createdAt: r.createdAt,
        updatedAt: Date.now(),
      }
      await redis.set(recordKey(id), JSON.stringify(next))
      return next
    },

    async search(query: MemoryQuery): Promise<MemorySearchResult> {
      const records = await loadAllForScope(query.scope)
      const candidates = records.filter((r) => {
        if (query.kinds?.length && !query.kinds.includes(r.kind)) return false
        return true
      })
      const minScore = query.minScore ?? 0
      const topK = query.topK ?? 6
      const scored = candidates
        .map((record) => ({ record, score: defaultScoreHit({ record, query }) }))
        .filter((h) => h.score >= minScore)
        .sort((a, b) => b.score - a.score)
      const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0
      const page = scored.slice(offset, offset + topK)
      const nextCursor =
        offset + topK < scored.length ? String(offset + topK) : undefined
      return { hits: page, nextCursor }
    },

    async list(
      scope,
      options: MemoryListOptions = {},
    ): Promise<MemoryListResult> {
      let items = await loadAllForScope(scope)
      if (options.kinds?.length) {
        const kinds = options.kinds
        items = items.filter((r) => kinds.includes(r.kind))
      }
      const order = options.order ?? 'createdAt:desc'
      items = [...items].sort((a, b) => {
        switch (order) {
          case 'createdAt:asc':
            return a.createdAt - b.createdAt
          case 'updatedAt:desc':
            return (
              (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
            )
          default:
            return b.createdAt - a.createdAt
        }
      })
      const limit = options.limit ?? items.length
      const offset = options.cursor
        ? Number.parseInt(options.cursor, 10) || 0
        : 0
      const page = items.slice(offset, offset + limit)
      const nextCursor =
        offset + limit < items.length ? String(offset + limit) : undefined
      return { items: page, nextCursor }
    },

    async delete(ids, scope) {
      for (const id of ids) {
        const r = await loadRecord(id)
        if (!r) continue
        if (!scopeMatches(r.scope, scope)) continue
        await redis.del(recordKey(id))
        await redis.srem(indexKey(scope), id)
      }
    },

    async clear(scope) {
      const ids = await redis.smembers(indexKey(scope))
      if (ids.length === 0) return
      await redis.del(...ids.map(recordKey))
      await redis.del(indexKey(scope))
    },
  }
}
