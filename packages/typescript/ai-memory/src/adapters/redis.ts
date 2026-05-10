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
 *
 * NOTE: `scan` follows the lowercase variadic form used by ioredis and
 * node-redis legacyMode: `scan(cursor, 'MATCH', pattern, 'COUNT', n)`
 * returning `[nextCursor, matchedKeys]`. node-redis v4+'s default
 * camelCase shape (`scan(cursor, { MATCH, COUNT })`) is not handled
 * here — Group C will address camelCase compatibility separately.
 */
export interface RedisLike {
  set: (key: string, value: string) => Promise<unknown>
  get: (key: string) => Promise<string | null>
  del: (...keys: Array<string>) => Promise<unknown>
  sadd: (key: string, ...members: Array<string>) => Promise<unknown>
  srem: (key: string, ...members: Array<string>) => Promise<unknown>
  smembers: (key: string) => Promise<Array<string>>
  mget: (...keys: Array<string>) => Promise<Array<string | null>>
  scan: (
    cursor: string | number,
    ...args: Array<string>
  ) => Promise<[string, Array<string>]>
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

function hasAnyScopeKey(scope: MemoryScope): boolean {
  for (const key of SCOPE_KEYS) {
    if (scope[key] != null) return true
  }
  return false
}

// Module-level flag so we only emit the malformed-row warning once per
// process. The adapter still skips malformed rows; this just surfaces a
// hint to developers who happen to be watching the console.
let warnedMalformedRow = false
function warnMalformedRowOnce(id: string, err: unknown): void {
  if (warnedMalformedRow) return
  warnedMalformedRow = true
  console.warn(
    `[tanstack-ai-memory] redisMemoryAdapter: skipped malformed record JSON (id=${id}). ` +
      `Subsequent malformed rows will be skipped silently. Reason: ${String(err)}`,
  )
}

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

  /**
   * Scope-key equality across all five SCOPE_KEYS. Used by `add` to detect
   * an upsert whose scope changed from the previously-stored record, so we
   * can srem the id from the old scope's index before sadding to the new
   * one. A simple per-key comparison is sufficient — `MemoryScope` values
   * are plain strings.
   */
  function scopesEqual(a: MemoryScope, b: MemoryScope): boolean {
    for (const key of SCOPE_KEYS) {
      if ((a[key] ?? null) !== (b[key] ?? null)) return false
    }
    return true
  }

  /**
   * Find every index bucket whose scope tuple is consistent with `scope`.
   *
   * The adapter stores records under an EXACT scope tuple
   * `${tenantId or _}:${userId or _}:${sessionId or _}:${threadId or _}:${namespace or _}`.
   * A partial query scope (e.g. `{ tenantId: 't1' }`) must therefore
   * enumerate every bucket whose tuple positions match the defined keys —
   * the rest can be anything, so we glob them with `*` and SCAN.
   *
   * Returns `[]` when `scope` has no defined keys: per the strict
   * empty-scope semantics in `scopeMatches`, an empty scope matches
   * nothing and so resolves to zero buckets.
   *
   * Assumption: scope values are app-supplied strings that don't contain
   * Redis glob metacharacters (`*`, `?`, `[`). The practical risk is low;
   * we don't escape here. Group C may revisit if a real bug surfaces.
   */
  async function findIndexKeysForScope(
    scope: MemoryScope,
  ): Promise<Array<string>> {
    if (!hasAnyScopeKey(scope)) return []
    const pattern = `${prefix}:index:${SCOPE_KEYS.map((k) =>
      scope[k] != null ? String(scope[k]) : '*',
    ).join(':')}`
    const seen = new Set<string>()
    let cursor = '0'
    do {
      const [next, batch] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        '100',
      )
      for (const k of batch) seen.add(k)
      cursor = next
    } while (cursor !== '0')
    return Array.from(seen)
  }

  async function loadRecord(id: string): Promise<MemoryRecord | undefined> {
    const raw = await redis.get(recordKey(id))
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as MemoryRecord
    } catch (err) {
      warnMalformedRowOnce(id, err)
      return undefined
    }
  }

  /**
   * Load and scope-filter every record reachable from `scope`.
   *
   * Iterates ALL index buckets whose scope tuple is consistent with the
   * query scope (via `findIndexKeysForScope`), mGets the records, filters
   * via `scopeMatches` (defensive — sub-bucket records that wouldn't
   * satisfy a mid-tuple constraint must still be dropped), and sweeps
   * expired/missing rows from each bucket they appeared in.
   */
  async function loadAllForScope(
    scope: MemoryScope,
  ): Promise<Array<MemoryRecord>> {
    if (!hasAnyScopeKey(scope)) return []
    const indexKeys = await findIndexKeysForScope(scope)
    if (indexKeys.length === 0) return []

    // Maintain id -> originating index key so srem of expired/missing rows
    // targets the bucket the id actually lives in.
    const idToIndexKey = new Map<string, string>()
    for (const idx of indexKeys) {
      const members = await redis.smembers(idx)
      for (const m of members) {
        // First-write-wins is fine: each record only lives in exactly one
        // index bucket in steady state, so duplicates here would only be a
        // transient state we're about to clean up anyway.
        if (!idToIndexKey.has(m)) idToIndexKey.set(m, idx)
      }
    }
    if (idToIndexKey.size === 0) return []

    const ids = Array.from(idToIndexKey.keys())
    const raws = await redis.mget(...ids.map(recordKey))
    const out: Array<MemoryRecord> = []
    // Group expired/missing ids by their originating index key so we can
    // srem them in a single call per bucket.
    const expiredByIndex = new Map<string, Array<string>>()
    function markExpired(id: string) {
      const idx = idToIndexKey.get(id)
      if (!idx) return
      const arr = expiredByIndex.get(idx) ?? []
      arr.push(id)
      expiredByIndex.set(idx, arr)
    }
    for (let i = 0; i < raws.length; i++) {
      const raw = raws[i] as string | null
      const id = ids[i] as string
      if (!raw) {
        markExpired(id)
        continue
      }
      try {
        const r = JSON.parse(raw) as MemoryRecord
        if (isExpired(r)) {
          markExpired(r.id)
          continue
        }
        if (!scopeMatches(r.scope, scope)) continue
        out.push(r)
      } catch (err) {
        warnMalformedRowOnce(id, err)
        /* skip malformed */
      }
    }
    if (expiredByIndex.size > 0) {
      const recordKeysToDelete: Array<string> = []
      for (const [idx, ids2] of expiredByIndex) {
        if (ids2.length === 0) continue
        await redis.srem(idx, ...ids2)
        for (const id of ids2) recordKeysToDelete.push(recordKey(id))
      }
      if (recordKeysToDelete.length > 0) {
        await redis.del(...recordKeysToDelete)
      }
    }
    return out
  }

  return {
    name: 'redis',

    async add(input) {
      const batch = Array.isArray(input) ? input : [input]
      const now = Date.now()
      for (const r of batch) {
        // If this id already exists under a DIFFERENT scope, remove it
        // from the old scope's index before we sadd to the new one.
        // Without this the id would be reachable from the old bucket and
        // surface in partial-scope traversals that happen to include it.
        const prev = await loadRecord(r.id)
        if (prev && !scopesEqual(prev.scope, r.scope)) {
          await redis.srem(indexKey(prev.scope), r.id)
        }
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
        .map((record) => ({
          record,
          score: defaultScoreHit({ record, query }),
        }))
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
            return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
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
        // srem against the RECORD'S actual scope, not the caller's scope.
        // A partial-scope caller (e.g. `{ tenantId: 't1' }`) would otherwise
        // try to srem from `t1:_:_:_:_` while the id actually lives in
        // `t1:u1:_:_:_`, leaving a dangling index entry.
        await redis.srem(indexKey(r.scope), id)
      }
    },

    async clear(scope) {
      // Empty-scope safety: refuse to wipe everything. The shared
      // `scopeMatches` helper treats `{}` as "match nothing"; mirror that
      // behaviour here so `clear({})` is a no-op rather than a tenant-wide
      // wipe (the index key for an all-blank scope would otherwise enumerate
      // a real bucket of records).
      if (!hasAnyScopeKey(scope)) return
      const indexKeys = await findIndexKeysForScope(scope)
      if (indexKeys.length === 0) return
      const idsToDelete = new Set<string>()
      for (const idx of indexKeys) {
        const members = await redis.smembers(idx)
        for (const m of members) idsToDelete.add(m)
      }
      if (idsToDelete.size > 0) {
        await redis.del(...Array.from(idsToDelete).map(recordKey))
      }
      await redis.del(...indexKeys)
    },
  }
}
