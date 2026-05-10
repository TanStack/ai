import { defaultScoreHit, isExpired, scopeMatches } from '@tanstack/ai/memory'
import type {
  MemoryAdapter,
  MemoryListOptions,
  MemoryListResult,
  MemoryQuery,
  MemoryRecord,
  MemoryScope,
  MemorySearchResult,
} from '@tanstack/ai/memory'

export function inMemoryMemoryAdapter(): MemoryAdapter {
  const records = new Map<string, MemoryRecord>()

  function liveRecords(): Array<MemoryRecord> {
    const now = Date.now()
    const out: Array<MemoryRecord> = []
    for (const r of records.values()) {
      if (isExpired(r, now)) records.delete(r.id)
      else out.push(r)
    }
    return out
  }

  function scopedLive(scope: MemoryScope): Array<MemoryRecord> {
    return liveRecords().filter((r) => scopeMatches(r.scope, scope))
  }

  return {
    name: 'in-memory',

    async add(input) {
      const batch = Array.isArray(input) ? input : [input]
      const now = Date.now()
      for (const r of batch) {
        records.set(r.id, { ...r, updatedAt: now })
      }
      // Opportunistic sweep — cheap on a single Map.
      liveRecords()
    },

    async get(id, scope) {
      const r = records.get(id)
      if (!r) return undefined
      if (isExpired(r)) {
        records.delete(id)
        return undefined
      }
      if (!scopeMatches(r.scope, scope)) return undefined
      return r
    },

    async update(id, scope, patch) {
      const existing = records.get(id)
      if (!existing) return undefined
      if (isExpired(existing)) {
        records.delete(id)
        return undefined
      }
      if (!scopeMatches(existing.scope, scope)) return undefined
      const next: MemoryRecord = {
        ...existing,
        ...patch,
        id: existing.id,
        scope: existing.scope,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      }
      records.set(id, next)
      return next
    },

    async search(query: MemoryQuery): Promise<MemorySearchResult> {
      const candidates = scopedLive(query.scope).filter((r) => {
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

      // Cursor support: encode an integer offset; nextCursor undefined when exhausted.
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
      let items = scopedLive(scope)
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
        const r = records.get(id)
        if (!r) continue
        if (!scopeMatches(r.scope, scope)) continue
        records.delete(id)
      }
    },

    async clear(scope) {
      for (const [id, r] of records) {
        if (scopeMatches(r.scope, scope)) records.delete(id)
      }
    },
  }
}
