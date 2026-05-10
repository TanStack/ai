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
 * Minimal subset of the Redis client API this adapter uses. Shaped to match
 * `ioredis` (and node-redis with `legacyMode: true`) directly — lowercase
 * method names plus the variadic `scan(cursor, 'MATCH', pattern, 'COUNT', n)`
 * form returning `[nextCursor, matchedKeys]`.
 *
 * For node-redis v4+'s default camelCase API (`sAdd`, `sRem`, `sMembers`,
 * `mGet`, `scan(cursor, { MATCH, COUNT })`), wrap the client with
 * {@link nodeRedisAsRedisLike} before passing it in. ioredis clients do not
 * need a wrapper.
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

/**
 * Minimal node-redis v4+ default-mode (camelCase) surface used by
 * {@link nodeRedisAsRedisLike}. Real node-redis clients are structurally
 * compatible with this shape — you do not need to construct one manually.
 */
export interface NodeRedisLike {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<unknown>
  del: (keys: Array<string> | string) => Promise<number>
  sAdd: (key: string, members: string | Array<string>) => Promise<number>
  sRem: (key: string, members: string | Array<string>) => Promise<number>
  sMembers: (key: string) => Promise<Array<string>>
  mGet: (keys: Array<string>) => Promise<Array<string | null>>
  /**
   * node-redis v4 accepts/returns `cursor: number`; node-redis v5 accepts
   * and returns `cursor: string`. We widen both ends to `number | string`
   * so the wrapper can thread either client's cursor through without
   * lossy coercion (string cursors past `Number.MAX_SAFE_INTEGER` lose
   * precision when round-tripped through `Number()`).
   */
  scan: (
    cursor: number | string,
    options?: { MATCH?: string; COUNT?: number },
  ) => Promise<{ cursor: number | string; keys: Array<string> }>
}

/**
 * Adapter helper: wraps a node-redis v4+ default-mode client (camelCase API)
 * into the lowercase {@link RedisLike} shape this adapter expects. Use when
 * you have a `redis` package client and don't want to enable `legacyMode`.
 *
 * Pass the result into `redisMemoryAdapter({ redis: nodeRedisAsRedisLike(client) })`.
 *
 * For `ioredis`, no wrapper is needed — `redisMemoryAdapter({ redis: client })`
 * works directly because ioredis already exposes lowercase method names.
 *
 * The wrapper translates the ioredis-style variadic `scan(cursor, 'MATCH',
 * pattern, 'COUNT', n)` form this adapter uses into node-redis v4's
 * options-object form, and unwraps the `{ cursor, keys }` reply back into
 * the `[nextCursor, matchedKeys]` tuple ioredis returns.
 */
export function nodeRedisAsRedisLike(client: NodeRedisLike): RedisLike {
  return {
    get: (key) => client.get(key),
    set: (key, value) => client.set(key, value),
    del: (...keys) => client.del(keys).then((n) => n),
    sadd: (key, ...members) => client.sAdd(key, members),
    srem: (key, ...members) => client.sRem(key, members),
    smembers: (key) => client.sMembers(key),
    mget: (...keys) => client.mGet(keys),
    scan: async (cursor, ...args) => {
      // Translate variadic (cursor, 'MATCH', pattern, 'COUNT', count) into
      // node-redis v4/v5's options-object form. Pairs are read positionally;
      // unknown tokens are ignored rather than rejected so future extensions
      // (e.g. TYPE) degrade gracefully if a caller passes them through.
      let match: string | undefined
      let count: number | undefined
      for (let i = 0; i < args.length; i += 2) {
        const key = String(args[i] ?? '').toUpperCase()
        const value = args[i + 1]
        if (key === 'MATCH' && typeof value === 'string') match = value
        else if (key === 'COUNT' && value !== undefined) {
          const n = Number(value)
          // Redis rejects COUNT <= 0. Drop silently rather than throwing so
          // a malformed caller-supplied COUNT degrades to "use server default"
          // instead of breaking SCAN entirely.
          if (Number.isFinite(n) && n > 0) count = n
        }
      }
      // Pass the cursor through as-is. node-redis v4 typed `cursor: number`,
      // v5 typed `cursor: string`. Coercing via `Number(cursor)` would lose
      // precision for v5 cursors larger than `Number.MAX_SAFE_INTEGER`. The
      // `as never` cast bridges the v4/v5 type divergence at the TS layer
      // without forcing callers to pin a specific node-redis major.
      const result = await client.scan(cursor as never, {
        ...(match !== undefined ? { MATCH: match } : {}),
        ...(count !== undefined ? { COUNT: count } : {}),
      })
      return [String(result.cursor), result.keys]
    },
  }
}

/**
 * Escape Redis glob metacharacters so a scope value can be safely interpolated
 * into a `SCAN MATCH` pattern. Redis SCAN's MATCH glob recognises `*`, `?`,
 * `[`, `]`, and `\` as metacharacters; the backslash is also the glob's escape
 * character. Without this, a scope value like `tenantId: 't*'` would cause the
 * SCAN pattern to match every other tenant's index bucket — a cross-tenant
 * leak through the documented isolation boundary.
 */
function escapeGlob(value: string): string {
  return value.replace(/[\\*?[\]]/g, '\\$&')
}

/**
 * Escape the `:` segment delimiter (and the `\` escape character itself) in a
 * scope value before composing the colon-joined `scopeKey` tuple. Without this,
 * a scope value containing `:` would shift the segment positions and a single-
 * key scope `{ tenantId: 'a:b' }` would collide with a multi-key scope
 * `{ tenantId: 'a', userId: 'b' }` — both would otherwise serialize to
 * `a:b:_:_:_:_` and silently merge two different tenants' index buckets.
 *
 * This is the EXACT-MATCH counterpart to `escapeGlob`'s SCAN MATCH defence:
 * together they close both sides of the cross-tenant leak through the documented
 * isolation boundary.
 */
function escapeScopeValue(value: string): string {
  // Escape : (our delimiter) and \ (the escape character itself).
  return value.replace(/[\\:]/g, '\\$&')
}

const SCOPE_KEYS = [
  'tenantId',
  'userId',
  'sessionId',
  'threadId',
  'namespace',
] as const

/**
 * Empty-string scope values are treated as undefined (mirrors `scopeMatches`).
 * A scope value MUST be a non-empty string to be meaningful — otherwise it
 * would be written as a literal empty segment (e.g. `:_:_:_:_`) that no
 * partial-scope query could ever reach.
 */
function hasAnyScopeKey(scope: MemoryScope): boolean {
  for (const key of SCOPE_KEYS) {
    const v = scope[key]
    if (v == null) continue
    if (typeof v === 'string' && v.length === 0) continue
    return true
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
    // Escape `:` and `\` in scope values so a value containing the delimiter
    // (e.g. `{ tenantId: 'a:b' }`) cannot collide with a multi-key scope
    // (e.g. `{ tenantId: 'a', userId: 'b' }`) that would otherwise serialize
    // to the same `a:b:_:_:_:_` tuple. Empty-string scope values are
    // normalised to the `_` placeholder per the same rule applied in
    // `scopeMatches` and `hasAnyScopeKey`.
    return SCOPE_KEYS.map((k) => {
      const v = scope[k]
      if (v == null) return '_'
      const str = String(v)
      if (str.length === 0) return '_'
      return escapeScopeValue(str)
    }).join(':')
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
   * Two escape passes are applied to literal scope values, IN ORDER:
   *   1. `escapeScopeValue` — escape `:` (the segment delimiter) so a scope
   *      value containing a colon does not shift segment positions in the
   *      SCAN pattern. This must run FIRST so the segment grid stays aligned
   *      with the EXACT-MATCH `scopeKey` form.
   *   2. `escapeGlob` — escape `*`, `?`, `[`, `]`, and `\` so a scope value
   *      cannot glob-match other tenants' index buckets.
   *
   * Order matters: if `escapeGlob` ran first it would emit `\*` for a literal
   * `*`, and `escapeScopeValue` would then re-escape that backslash as
   * `\\\*`, producing a stray escape pair that does not match what `scopeKey`
   * wrote. Running `escapeScopeValue` first leaves the glob characters
   * untouched, then `escapeGlob` escapes them along with the backslashes
   * `escapeScopeValue` introduced — yielding a pattern whose literal segments
   * exactly match the `scopeKey` form.
   *
   * The `*` we substitute for unset scope keys is left unescaped because it
   * is the SCAN wildcard we actually want.
   */
  async function findIndexKeysForScope(
    scope: MemoryScope,
  ): Promise<Array<string>> {
    if (!hasAnyScopeKey(scope)) return []
    const pattern = `${prefix}:index:${SCOPE_KEYS.map((k) => {
      const v = scope[k]
      if (v == null) return '*'
      const str = String(v)
      // Empty-string values are not "defined" per `hasAnyScopeKey`; if all
      // were empty we'd have returned above. A single empty value among
      // others should still glob ('*') so a partial-scope query that mixes
      // a meaningful key with an empty-string fallback is interpreted the
      // same as omitting the empty one entirely.
      if (str.length === 0) return '*'
      // Escape : FIRST (segment delimiter), THEN glob metacharacters.
      return escapeGlob(escapeScopeValue(str))
    }).join(':')}`
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
