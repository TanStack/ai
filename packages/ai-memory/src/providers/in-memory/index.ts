import {
  inspectRecords,
  isExpired,
  listRecordFacts,
  recallRecords,
  sameScope,
  saveTurn,
} from '../../internal/store'
import type {
  BuiltinOptions,
  MemoryRecord,
  RecordStore,
} from '../../internal/store'
import type { MemoryAdapter, MemoryScope } from '../../types'

/**
 * Options for {@link inMemory}. Retrieval/extraction knobs that used to live on
 * the middleware are adapter options here.
 */
export interface InMemoryOptions extends BuiltinOptions {}

/**
 * Zero-dependency memory adapter backed by a `Map`. Records vanish on process
 * restart, so this is for local development, tests, and single-process demos —
 * not multi-process production (each worker gets its own Map). For production,
 * use {@link redis} from `@tanstack/ai-memory/redis`.
 *
 * By default `save` stores the raw user/assistant turn and `recall` scores it
 * lexically + by recency. Pass an `embedder` for semantic scoring and/or an
 * `extract` function to persist derived facts.
 */
export function inMemory(options: InMemoryOptions = {}): MemoryAdapter {
  const records = new Map<string, MemoryRecord>()

  function sweep(): Array<MemoryRecord> {
    const now = Date.now()
    const live: Array<MemoryRecord> = []
    for (const r of records.values()) {
      if (isExpired(r, now)) records.delete(r.id)
      else live.push(r)
    }
    return live
  }

  const store: RecordStore = {
    async add(batch) {
      const now = Date.now()
      for (const r of batch) records.set(r.id, { ...r, updatedAt: now })
      sweep()
    },
    async loadScope(scope: MemoryScope) {
      return sweep().filter((r) => sameScope(r.scope, scope))
    },
  }

  return {
    id: 'in-memory',
    recall: (scope, query) => recallRecords(store, scope, query, options),
    save: (scope, turn) => saveTurn(store, scope, turn, options),
    inspect: (scope) => inspectRecords(store, scope),
    listFacts: (scope) => listRecordFacts(store, scope),
  }
}
